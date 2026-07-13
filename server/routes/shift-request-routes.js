import { requirePermission, requireUser } from '../auth.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { badRequest, json, notFound, readJsonBody } from '../http.js'
import { buildPushPayload, notifyUsers } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  getPendingShiftUnbookRequestStatement,
  insertShiftStatement,
  listUsersWithScheduleManageStatement,
  updateShiftEmployeeStatement,
  updateShiftUnbookRequestStatusStatement,
} from '../statements.js'
import { formatShiftLabel, isValidShiftRange } from '../api-utils.js'
import { withResourceMutation } from '../services/mutation-service.js'

const mutateSchedule = (database, user, execute) => withResourceMutation({
  database,
  user,
  resource: 'schedule',
  execute,
})

const parseUnbookRequestPath = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/unbook-requests\/(\d+)\/(approve|reject)$/)
  if (!match) return null
  return { id: Number(match[1]), action: match[2] }
}

const handleUnbookDecision = async ({ req, res, pathname, db }) => {
  const action = parseUnbookRequestPath(pathname)
  if (!action || req.method !== 'PATCH') return false
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  let request = await getPendingShiftUnbookRequestStatement.get(action.id)
  if (!request) {
    notFound(res, 'Заявка не найдена')
    return true
  }

  const mutation = await mutateSchedule(db, user, async (client) => {
    request = await getPendingShiftUnbookRequestStatement.getOn(client, action.id)
    if (!request) throw new HttpError(404, 'Заявка не найдена', 'REQUEST_NOT_FOUND')
    if (action.action === 'approve') {
      if (
        normalizePersonName(request.employee_name) !==
        normalizePersonName(request.requester_name)
      ) {
        throw new HttpError(
          400,
          'Сотрудник уже не записан на эту смену',
          'SHIFT_ASSIGNEE_CHANGED',
        )
      }
      await updateShiftEmployeeStatement.runOn(client, null, request.shift_id)
      await updateShiftUnbookRequestStatusStatement.runOn(
        client,
        'approved',
        user.id,
        request.id,
      )
    } else {
      await updateShiftUnbookRequestStatusStatement.runOn(
        client,
        'rejected',
        user.id,
        request.id,
      )
    }
    const approved = action.action === 'approve'
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: request.shift_id,
      action: approved ? 'shift.unbook_request_approve' : 'shift.unbook_request_reject',
      before: request,
      after: {
        ...request,
        ...(approved ? { employee_name: null } : {}),
        status: approved ? 'approved' : 'rejected',
      },
      context: { requestId: request.id, requesterUserId: request.requester_user_id },
      client,
    })
  })

  const approved = action.action === 'approve'
  await notifyUsers(
    [request.requester_user_id],
    'shifts',
    buildPushPayload({
      title: approved ? 'Заявка на снятие подтверждена' : 'Заявка на снятие отклонена',
      body: formatShiftLabel(request),
      url: '/schedule',
      tag: `shift-unbook-request-${approved ? 'approved' : 'rejected'}-${request.id}`,
      ...(approved ? { urgency: 'high' } : {}),
    }),
  )
  json(res, 200, { ok: true, revision: mutation.revision })
  return true
}

const handleHelpRequest = async ({ req, res, db }) => {
  const user = await requireUser(req, res)
  if (!user) return true
  const body = await readJsonBody(req)
  const date = String(body.date || '')
  const startTime = String(body.start_time || '')
  const endTime = String(body.end_time || '')
  if (!date || !startTime || !endTime) {
    badRequest(res, 'Заполните дату и время')
    return true
  }
  if (!isValidShiftRange(startTime, endTime)) {
    badRequest(res, 'Время окончания должно быть позже начала')
    return true
  }

  let shiftId
  const mutation = await mutateSchedule(db, user, async (client) => {
    const result = await insertShiftStatement.runOn(
      client,
      date,
      startTime,
      endTime,
      user.name,
      'pending',
      user.id,
    )
    shiftId = Number(result.lastInsertRowid)
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.help_request',
      after: {
        date,
        start_time: startTime,
        end_time: endTime,
        employee_name: user.name,
        status: 'pending',
      },
      client,
    })
  })
  const scheduleManagers = (await listUsersWithScheduleManageStatement.all())
    .map((row) => row.id)
    .filter((id) => id !== user.id)
  await notifyUsers(
    scheduleManagers,
    'shifts',
    buildPushPayload({
      title: 'Новая заявка на смену',
      body: `${user.name}: ${date} ${startTime}-${endTime}`,
      url: '/schedule',
      tag: `shift-help-request-${shiftId}`,
      urgency: 'high',
    }),
  )
  json(res, 201, { id: shiftId, revision: mutation.revision })
  return true
}

export const handleShiftRequestRoutes = async (context) => {
  if (await handleUnbookDecision(context)) return true
  if (context.pathname === '/api/shifts/help-request' && context.req.method === 'POST') {
    return handleHelpRequest(context)
  }
  return false
}
