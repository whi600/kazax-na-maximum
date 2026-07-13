import { requirePermission, requireUser } from '../auth.js'
import { logAudit } from '../audit.js'
import { badRequest, json, readJsonBody } from '../http.js'
import {
  deleteScheduleTemplateShiftsStatement,
  insertScheduleTemplateShiftStatement,
  listScheduleTemplateShiftsStatement,
} from '../statements.js'
import { isValidShiftRange } from '../api-utils.js'
import {
  getResourceRevision,
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'

const RESOURCE = 'schedule_template'

const toTemplateDto = (row) => ({
  id: row.id,
  day_index: Number(row.day_index),
  start_time: row.start_time,
  end_time: row.end_time,
  sort_order: Number(row.sort_order || 0),
})

const normalizeTemplateShifts = (items) => {
  if (!Array.isArray(items)) return null

  const perDayOrder = new Map()
  const normalized = []

  for (const item of items) {
    const dayIndex = Number(item?.day_index)
    const startTime = String(item?.start_time || '').trim()
    const endTime = String(item?.end_time || '').trim()

    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null
    if (!isValidShiftRange(startTime, endTime)) return null

    const nextOrder = perDayOrder.get(dayIndex) || 0
    perDayOrder.set(dayIndex, nextOrder + 1)
    normalized.push({
      day_index: dayIndex,
      start_time: startTime,
      end_time: endTime,
      sort_order: nextOrder,
    })
  }

  return normalized
}

export const handleScheduleTemplateRoutes = async ({ req, res, pathname, db }) => {
  if (pathname === '/api/schedule-template' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const rows = await listScheduleTemplateShiftsStatement.all()
    json(res, 200, {
      shifts: rows.map(toTemplateDto),
      revision: await getResourceRevision(RESOURCE),
    })
    return true
  }

  if (pathname === '/api/schedule-template' && req.method === 'PUT') {
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

    const body = await readJsonBody(req)
    const meta = parseMutationMeta(req, body)
    const normalized = normalizeTemplateShifts(body.shifts)
    if (!normalized) {
      badRequest(res, 'Проверьте дни и время смен')
      return true
    }

    const result = await withVersionedMutation({
      database: db,
      user,
      resource: RESOURCE,
      meta,
      payload: { action: 'update', shifts: normalized },
      execute: async (client, { currentRevision }) => {
        const before = (await listScheduleTemplateShiftsStatement.allOn(client))
          .map(toTemplateDto)
        await deleteScheduleTemplateShiftsStatement.runOn(client)
        for (const shift of normalized) {
          await insertScheduleTemplateShiftStatement.runOn(
            client,
            shift.day_index,
            shift.start_time,
            shift.end_time,
            shift.sort_order,
          )
        }
        const rows = await listScheduleTemplateShiftsStatement.allOn(client)
        const forced = meta.force && meta.baseRevision !== currentRevision
        await logAudit({
          actorUser: user,
          entityType: 'schedule_template',
          action: 'schedule_template.update',
          before,
          after: { shifts: normalized },
          context: {
            count: normalized.length,
            ...(forced ? { conflictResolution: 'force' } : {}),
          },
          client,
        })
        return { payload: { shifts: rows.map(toTemplateDto) } }
      },
    })

    json(res, result.statusCode, result.payload)
    return true
  }

  return false
}
