import { getUserPermissions, requireUser } from '../auth.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { badRequest, forbidden, json, notFound, readJsonBody } from '../http.js'
import { buildPushPayload, notifyUsers } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  createShiftUnbookRequestStatement,
  getShiftByIdStatement,
  getUserByIdStatement,
  updateShiftEmployeeStatement,
  updateShiftStatusStatement,
} from '../statements.js'
import { formatShiftLabel, parseShiftId } from '../api-utils.js'
import {
  getScheduleManagerIds,
  isShiftEnded,
  notifyShiftDeleted,
  parseWeekDeletePath,
} from './shift-route-utils.js'
import { handleShiftAdminMutationRoutes } from './shift-admin-mutation-routes.js'
import { handleBulkSaveShifts } from './shift-bulk-handlers.js'
import { toUnbookRequestDto } from './shift-dto.js'
import { handleShiftQueryRoutes } from './shift-query-routes.js'
import { handleShiftRequestRoutes } from './shift-request-routes.js'
import { handleDeleteShiftWeek } from './shift-week-handlers.js'
import { withResourceMutation } from '../services/mutation-service.js'

const mutateSchedule = (database, user, execute) => withResourceMutation({
  database,
  user,
  resource: 'schedule',
  execute,
})

const handleUnbookRequest = async ({ req, res, db, authUser, shift, shiftId }) => {
  if (!shift.employee_name) {
    badRequest(res, 'На смене нет сотрудника')
    return true
  }
  if (isShiftEnded(shift)) {
    badRequest(res, 'Нельзя отправить заявку по прошедшей смене')
    return true
  }
  if (normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)) {
    forbidden(res)
    return true
  }

  let requestId
  let currentShift = shift
  const mutation = await mutateSchedule(db, authUser, async (client) => {
    currentShift = await getShiftByIdStatement.getOn(client, shiftId)
    if (!currentShift?.employee_name) {
      throw new HttpError(400, 'На смене нет сотрудника', 'SHIFT_NOT_ASSIGNED')
    }
    if (
      normalizePersonName(currentShift.employee_name) !==
      normalizePersonName(authUser.name)
    ) {
      throw new HttpError(403, 'Недостаточно прав', 'FORBIDDEN')
    }
    const result = await createShiftUnbookRequestStatement.runOn(
      client,
      shiftId,
      authUser.id,
      authUser.name,
    )
    requestId = Number(result.lastInsertRowid)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.unbook_request',
      before: currentShift,
      context: { requestId },
      client,
    })
  })
  await notifyUsers(
    await getScheduleManagerIds(authUser.id),
    'shifts',
    buildPushPayload({
      title: 'Заявка на снятие со смены',
      body: `${authUser.name}: ${formatShiftLabel(currentShift)}`,
      url: '/schedule',
      tag: `shift-unbook-request-${shiftId}-${authUser.id}`,
      urgency: 'high',
    }),
  )
  json(res, 201, {
    request: toUnbookRequestDto({
      id: requestId,
      shift_id: shiftId,
      requester_user_id: authUser.id,
      requester_name: authUser.name,
      status: 'pending',
      created_at: new Date().toISOString(),
      date: currentShift.date,
      start_time: currentShift.start_time,
      end_time: currentShift.end_time,
      employee_name: currentShift.employee_name,
    }),
    revision: mutation.revision,
  })
  return true
}

const handleBook = async ({ res, db, authUser, shift, shiftId }) => {
  if (shift.employee_name) {
    badRequest(res, 'Смена уже занята')
    return true
  }
  let currentShift = shift
  const mutation = await mutateSchedule(db, authUser, async (client) => {
    currentShift = await getShiftByIdStatement.getOn(client, shiftId)
    if (!currentShift || currentShift.employee_name) {
      throw new HttpError(400, 'Смена уже занята', 'SHIFT_ALREADY_ASSIGNED')
    }
    await updateShiftEmployeeStatement.runOn(client, authUser.name, shiftId)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.book',
      before: currentShift,
      after: { ...currentShift, employee_name: authUser.name },
      client,
    })
  })
  await notifyUsers(
    await getScheduleManagerIds(authUser.id),
    'shifts',
    buildPushPayload({
      title: 'Смена занята',
      body: `${authUser.name}: ${formatShiftLabel(currentShift)}`,
      url: '/schedule',
      tag: `shift-booked-${shiftId}`,
    }),
  )
  json(res, 200, { ok: true, revision: mutation.revision })
  return true
}

const handleAssign = async ({ req, res, db, authUser, shift, shiftId }) => {
  const permissions = await getUserPermissions(authUser)
  if (!permissions.scheduleManage) {
    forbidden(res)
    return true
  }
  if (shift.employee_name) {
    badRequest(res, 'Смена уже занята')
    return true
  }
  if (isShiftEnded(shift)) {
    badRequest(res, 'Нельзя назначить сотрудника на прошедшую смену')
    return true
  }

  const body = await readJsonBody(req)
  const targetUserId = Number(body.userId)
  if (!Number.isFinite(targetUserId)) {
    badRequest(res, 'Выберите сотрудника')
    return true
  }
  const targetUser = await getUserByIdStatement.get(targetUserId)
  if (!targetUser) {
    notFound(res, 'Пользователь не найден')
    return true
  }

  let currentShift = shift
  const mutation = await mutateSchedule(db, authUser, async (client) => {
    currentShift = await getShiftByIdStatement.getOn(client, shiftId)
    if (!currentShift || currentShift.employee_name) {
      throw new HttpError(400, 'Смена уже занята', 'SHIFT_ALREADY_ASSIGNED')
    }
    await updateShiftEmployeeStatement.runOn(client, targetUser.name, shiftId)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.assign',
      before: currentShift,
      after: { ...currentShift, employee_name: targetUser.name },
      context: { assignedUserId: targetUser.id, assignedUserName: targetUser.name },
      client,
    })
  })
  if (targetUser.id !== authUser.id) {
    await notifyUsers(
      [targetUser.id],
      'shifts',
      buildPushPayload({
        title: 'Вас поставили на смену',
        body: `${formatShiftLabel(currentShift)}. Назначил: ${authUser.name}`,
        url: '/schedule',
        tag: `shift-assigned-${shiftId}`,
        urgency: 'high',
      }),
    )
  }
  json(res, 200, {
    ok: true,
    employee_name: targetUser.name,
    revision: mutation.revision,
  })
  return true
}

const handleUnbook = async ({ res, db, authUser, shift, shiftId }) => {
  const permissions = await getUserPermissions(authUser)
  if (!permissions.scheduleManage) {
    forbidden(res)
    return true
  }
  let currentShift = shift
  const mutation = await mutateSchedule(db, authUser, async (client) => {
    currentShift = await getShiftByIdStatement.getOn(client, shiftId)
    if (!currentShift) throw new HttpError(404, 'Смена не найдена', 'SHIFT_NOT_FOUND')
    await updateShiftEmployeeStatement.runOn(client, null, shiftId)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.unbook',
      before: currentShift,
      after: { ...currentShift, employee_name: null },
      client,
    })
  })
  await notifyShiftDeleted({
    shift: currentShift,
    actorUser: authUser,
    tagId: shiftId,
    title: 'С вас сняли смену',
  })
  json(res, 200, { ok: true, revision: mutation.revision })
  return true
}

const handleApprove = async ({ res, db, authUser, shift, shiftId }) => {
  const permissions = await getUserPermissions(authUser)
  if (!permissions.scheduleManage) {
    forbidden(res)
    return true
  }
  let currentShift = shift
  const mutation = await mutateSchedule(db, authUser, async (client) => {
    currentShift = await getShiftByIdStatement.getOn(client, shiftId)
    if (!currentShift) throw new HttpError(404, 'Смена не найдена', 'SHIFT_NOT_FOUND')
    await updateShiftStatusStatement.runOn(client, 'approved', shiftId)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftId,
      action: 'shift.approve',
      before: currentShift,
      after: { ...currentShift, status: 'approved' },
      client,
    })
  })
  if (currentShift.created_by) {
    await notifyUsers(
      [currentShift.created_by],
      'shifts',
      buildPushPayload({
        title: 'Заявка на смену подтверждена',
        body: `${currentShift.date} ${currentShift.start_time}-${currentShift.end_time}`,
        url: '/schedule',
        tag: `shift-approved-${shiftId}`,
        urgency: 'high',
      }),
    )
  }
  json(res, 200, { ok: true, revision: mutation.revision })
  return true
}

const handleShiftAction = async ({ req, res, pathname, db }) => {
  const action = parseShiftId(pathname)
  if (!action) return false
  const authUser = await requireUser(req, res)
  if (!authUser) return true
  const shift = await getShiftByIdStatement.get(action.id)
  if (!shift) {
    notFound(res, 'Смена не найдена')
    return true
  }
  const context = { req, res, db, authUser, shift, shiftId: action.id }
  if (req.method === 'POST' && action.action === 'unbook-request') {
    return handleUnbookRequest(context)
  }
  if (req.method === 'PATCH' && action.action === 'book') return handleBook(context)
  if (req.method === 'PATCH' && action.action === 'assign') return handleAssign(context)
  if (req.method === 'PATCH' && action.action === 'unbook') return handleUnbook(context)
  if (req.method === 'PATCH' && action.action === 'approve') return handleApprove(context)
  return false
}

export const handleShiftRoutes = async ({ req, res, pathname, requestUrl, db }) => {
  const context = { req, res, pathname, requestUrl, db }
  if (await handleShiftAdminMutationRoutes(context)) return true
  if (await handleShiftRequestRoutes(context)) return true
  if (await handleShiftQueryRoutes(context)) return true

  const weekStart = parseWeekDeletePath(pathname)
  if (weekStart && req.method === 'DELETE') {
    return handleDeleteShiftWeek({ req, res, db, weekStart })
  }
  if (pathname === '/api/shifts/bulk-save' && req.method === 'POST') {
    return handleBulkSaveShifts({ req, res, db })
  }
  return handleShiftAction(context)
}
