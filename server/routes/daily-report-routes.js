import { logAudit } from '../audit.js'
import { requireUser } from '../auth.js'
import { HttpError } from '../errors.js'
import { badRequest, forbidden, json, readJsonBody } from '../http.js'
import { getToday } from '../date-utils.js'
import {
  deleteDailyReportStatusStatement,
  deleteTodayRecordsStatement,
  getDailyReportStatusStatement,
  insertDailyRecordStatement,
  listTodayRecordsStatement,
  upsertDailyReportStatusStatement,
} from '../statements.js'
import {
  getResourceRevision,
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'
import {
  canEditDailyReport,
  canOverrideCompletedReport,
  canUseReportMutationDate,
  getReportResource,
  mapReportEntries,
  mapReportStatus,
  normalizeReportEntries,
} from '../services/report-service.js'

const reportPathPattern = /^\/api\/daily-records\/(\d{4}-\d{2}-\d{2})(\/complete)?$/

const parseReportTarget = (pathname) => {
  if (pathname === '/api/daily-records/today') return { date: getToday(), complete: false }
  if (pathname === '/api/daily-records/today/complete') return { date: getToday(), complete: true }
  const match = pathname.match(reportPathPattern)
  if (!match) return null
  return { date: match[1], complete: Boolean(match[2]) }
}

const getReportPayload = async (user, date) => {
  const canOverrideCompletion = canOverrideCompletedReport(user)
  return {
    recordDate: date,
    entries: mapReportEntries(await listTodayRecordsStatement.all(date)),
    canEdit: canOverrideCompletion || await canEditDailyReport(user, date),
    canOverrideCompletion,
    reportStatus: mapReportStatus(await getDailyReportStatusStatement.get(date)),
    revision: await getResourceRevision(getReportResource(date)),
  }
}

export const handleDailyReportRoutes = async ({ req, res, pathname, db }) => {
  const target = parseReportTarget(pathname)
  if (!target) return false

  const user = await requireUser(req, res)
  if (!user) return true
  const { date, complete } = target

  if (req.method === 'GET' && !complete) {
    if (date !== getToday() && !(await canEditDailyReport(user, date))) {
      forbidden(res, 'Нет доступа к черновику отчета за эту дату')
      return true
    }
    json(res, 200, await getReportPayload(user, date))
    return true
  }

  const isSave = req.method === 'PUT' && !complete
  const isComplete = req.method === 'POST' && complete
  if (!isSave && !isComplete) return false

  const body = await readJsonBody(req)
  const offlineReplay = body.offlineReplay === true
  if (!canUseReportMutationDate({ user, date, offlineReplay })) {
    forbidden(res, 'Синхронизировать можно только сегодняшний или вчерашний отчет')
    return true
  }
  if (!(await canEditDailyReport(user, date))) {
    forbidden(
      res,
      isComplete
        ? 'Отметить отчет готовым может только админ или сотрудник со сменой в этот день'
        : 'Редактировать отчет может только админ или сотрудник со сменой в этот день',
    )
    return true
  }

  const entries = isSave ? normalizeReportEntries(body.entries) : []
  if (isSave && !Array.isArray(body.entries)) {
    badRequest(res, 'Некорректный список позиций')
    return true
  }
  const meta = parseMutationMeta(req, body)
  const resource = getReportResource(date)
  const result = await withVersionedMutation({
    database: db,
    user,
    resource,
    meta,
    payload: { action: isSave ? 'save' : 'complete', date, entries },
    execute: async (client) => {
      if (isSave) {
        const status = await getDailyReportStatusStatement.getOn(client, date)
        if (status?.completed_at && !canOverrideCompletedReport(user)) {
          throw new HttpError(
            403,
            'Отчет уже отмечен готовым. Для изменений обратитесь к администратору',
            'REPORT_COMPLETED',
          )
        }

        await deleteTodayRecordsStatement.runOn(client, date)
        await deleteDailyReportStatusStatement.runOn(client, date)
        for (const entry of entries) {
          await insertDailyRecordStatement.runOn(
            client,
            date,
            entry.arrival,
            entry.remainder,
            entry.write_off,
            user.id,
            entry.product_id,
          )
        }
        await logAudit({
          actorUser: user,
          entityType: 'daily_report',
          entityId: date,
          action: 'daily_report.save',
          after: { record_date: date, entries_count: entries.length },
          client,
        })
        return { payload: { ok: true, reportStatus: mapReportStatus(null) } }
      }

      await upsertDailyReportStatusStatement.runOn(client, date, user.id)
      const reportStatus = mapReportStatus(
        await getDailyReportStatusStatement.getOn(client, date),
      )
      await logAudit({
        actorUser: user,
        entityType: 'daily_report',
        entityId: date,
        action: 'daily_report.complete',
        after: { record_date: date, completed_by_user_id: user.id },
        client,
      })
      return { payload: { ok: true, reportStatus } }
    },
  })

  json(res, result.statusCode, result.payload)
  return true
}
