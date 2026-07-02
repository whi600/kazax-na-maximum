import { getUserPermissions, requirePermission, requireUser } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
import { badRequest, forbidden, json, notFound, readJsonBody } from '../http.js'
import { buildPushPayload, notifyUserByName, notifyUsers } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  deleteShiftStatement,
  createShiftUnbookRequestStatement,
  getShiftByIdStatement,
  getPendingShiftUnbookRequestStatement,
  getUserByIdStatement,
  insertShiftStatement,
  countArchiveShiftsStatement,
  listEmployeeUsersStatement,
  listArchiveShiftEmployeeCountsStatement,
  listArchiveShiftsPageStatement,
  listPendingShiftUnbookRequestsStatement,
  listScheduleAssignableUsersStatement,
  listUpcomingShiftsStatement,
  listUserPendingShiftUnbookRequestsStatement,
  listUsersWithScheduleManageStatement,
  updateShiftUnbookRequestStatusStatement,
  updateShiftDetailsStatement,
  updateShiftEmployeeStatement,
  updateShiftStatusStatement,
} from '../statements.js'
import {
  formatShiftLabel,
  getCurrentWeekStartDate,
  isValidShiftRange,
  notifyNewFreeShifts,
  parseInteger,
  parseShiftId,
  toShiftDto,
} from '../api-utils.js'
import {
  getScheduleManagerIds,
  isShiftEnded,
  notifyShiftDeleted,
  parseWeekDeletePath,
} from './shift-route-utils.js'
import { handleBulkSaveShifts } from './shift-bulk-handlers.js'
import { handleDeleteShiftWeek } from './shift-week-handlers.js'

const parseUnbookRequestPath = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/unbook-requests\/(\d+)\/(approve|reject)$/)
  if (!match) return null
  return { id: Number(match[1]), action: match[2] }
}

const toUnbookRequestDto = (row) => ({
  id: row.id,
  type: 'unbook',
  shift_id: row.shift_id,
  requester_user_id: row.requester_user_id,
  requester_name: row.requester_name,
  employee_name: row.requester_name,
  status: row.status || 'pending',
  created_at: row.created_at,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
})

const attachUnbookRequestToShift = (shift, requestByShiftId) => ({
  ...toShiftDto(shift),
  unbook_request: requestByShiftId.get(Number(shift.id)) || null,
})

export const handleShiftRoutes = async ({ req, res, pathname, requestUrl, db }) => {
  const unbookRequestAction = parseUnbookRequestPath(pathname)
  if (unbookRequestAction && req.method === 'PATCH') {
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

    const request = await getPendingShiftUnbookRequestStatement.get(unbookRequestAction.id)
    if (!request) {
      notFound(res, 'Заявка не найдена')
      return true
    }

    if (unbookRequestAction.action === 'approve') {
      if (
        normalizePersonName(request.employee_name) !==
        normalizePersonName(request.requester_name)
      ) {
        badRequest(res, 'Сотрудник уже не записан на эту смену')
        return true
      }

      await db.transaction(async (client) => {
        await updateShiftEmployeeStatement.runOn(client, null, request.shift_id)
        await updateShiftUnbookRequestStatusStatement.runOn(
          client,
          'approved',
          user.id,
          request.id,
        )
      })
      await touchResource('schedule', user)
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: request.shift_id,
        action: 'shift.unbook_request_approve',
        before: request,
        after: { ...request, employee_name: null, status: 'approved' },
        context: { requestId: request.id, requesterUserId: request.requester_user_id },
      })
      await notifyUsers(
        [request.requester_user_id],
        'shifts',
        buildPushPayload({
          title: 'Заявка на снятие подтверждена',
          body: formatShiftLabel(request),
          url: '/schedule',
          tag: `shift-unbook-request-approved-${request.id}`,
          urgency: 'high',
        }),
      )
      json(res, 200, { ok: true })
      return true
    }

    await updateShiftUnbookRequestStatusStatement.run(
      'rejected',
      user.id,
      request.id,
    )
    await touchResource('schedule', user)
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: request.shift_id,
      action: 'shift.unbook_request_reject',
      before: request,
      after: { ...request, status: 'rejected' },
      context: { requestId: request.id, requesterUserId: request.requester_user_id },
    })
    await notifyUsers(
      [request.requester_user_id],
      'shifts',
      buildPushPayload({
        title: 'Заявка на снятие отклонена',
        body: formatShiftLabel(request),
        url: '/schedule',
        tag: `shift-unbook-request-rejected-${request.id}`,
      }),
    )
    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/shifts/upcoming' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const weekStart = getCurrentWeekStartDate()
    const rows = await listUpcomingShiftsStatement.all(weekStart)
    const permissions = await getUserPermissions(user)
    const unbookRows = permissions.scheduleManage
      ? await listPendingShiftUnbookRequestsStatement.all(weekStart)
      : await listUserPendingShiftUnbookRequestsStatement.all(user.id, weekStart)
    const unbookRequests = unbookRows.map(toUnbookRequestDto)
    const requestByShiftId = new Map(
      unbookRequests.map((request) => [Number(request.shift_id), request]),
    )

    json(res, 200, {
      shifts: rows.map((shift) => attachUnbookRequestToShift(shift, requestByShiftId)),
      unbookRequests: permissions.scheduleManage ? unbookRequests : [],
    })
    return true
  }

  if (pathname === '/api/shifts/archive' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const limit = Math.max(
      1,
      Math.min(500, parseInteger(requestUrl.searchParams.get('limit'), 10)),
    )
    const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
    const [rows, countRow, employeeCountRows] = await Promise.all([
      listArchiveShiftsPageStatement.all(limit, offset),
      countArchiveShiftsStatement.get(),
      listArchiveShiftEmployeeCountsStatement.all(),
    ])
    const total = Number(countRow?.count || 0)
    const employeeCounts = employeeCountRows.map((row) => ({
      name: row.employee_name,
      count: Number(row.count || 0),
    }))
    const assignedTotal = employeeCounts.reduce((sum, employee) => sum + employee.count, 0)
    json(res, 200, {
      shifts: rows.map(toShiftDto),
      limit,
      offset,
      total,
      assignedTotal,
      employeeCounts,
      hasMore: offset + limit < total,
    })
    return true
  }

  if (pathname === '/api/shifts/assignable-users' && req.method === 'GET') {
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true

    const users = (await listScheduleAssignableUsersStatement.all()).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.created_at,
    }))

    json(res, 200, { users })
    return true
  }

  const weekStartToDelete = parseWeekDeletePath(pathname)
  if (weekStartToDelete && req.method === 'DELETE') {
    return handleDeleteShiftWeek({ req, res, db, weekStart: weekStartToDelete })
  }

  if (pathname === '/api/shifts/help-request' && req.method === 'POST') {
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

    const result = await insertShiftStatement.run(
      date,
      startTime,
      endTime,
      user.name,
      'pending',
      user.id,
    )
    await touchResource('schedule', user)
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: Number(result.lastInsertRowid),
      action: 'shift.help_request',
      after: {
        date,
        start_time: startTime,
        end_time: endTime,
        employee_name: user.name,
        status: 'pending',
      },
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
        tag: `shift-help-request-${Number(result.lastInsertRowid)}`,
        urgency: 'high',
      }),
    )

    json(res, 201, { id: Number(result.lastInsertRowid) })
    return true
  }

  if (pathname === '/api/shifts/admin-create' && req.method === 'POST') {
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

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

    const result = await insertShiftStatement.run(
      date,
      startTime,
      endTime,
      null,
      'approved',
      user.id,
    )
    await touchResource('schedule', user)
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: Number(result.lastInsertRowid),
      action: 'shift.admin_create',
      after: {
        date,
        start_time: startTime,
        end_time: endTime,
        employee_name: null,
        status: 'approved',
      },
    })
    await notifyNewFreeShifts({
      shifts: [
        {
          id: Number(result.lastInsertRowid),
          date,
          start_time: startTime,
          end_time: endTime,
        },
      ],
      actorUser: user,
      listEmployeeUsersStatement,
    })

    json(res, 201, { id: Number(result.lastInsertRowid) })
    return true
  }

  if (pathname === '/api/shifts/bulk-save' && req.method === 'POST') {
    return handleBulkSaveShifts({ req, res, db })
  }

  const shiftAction = parseShiftId(pathname)
  if (!shiftAction) return false

  const authUser = await requireUser(req, res)
  if (!authUser) return true

  const shift = await getShiftByIdStatement.get(shiftAction.id)
  if (!shift) {
    notFound(res, 'Смена не найдена')
    return true
  }

  if (req.method === 'POST' && shiftAction.action === 'unbook-request') {
    if (!shift.employee_name) {
      badRequest(res, 'На смене нет сотрудника')
      return true
    }

    if (isShiftEnded(shift)) {
      badRequest(res, 'Нельзя отправить заявку по прошедшей смене')
      return true
    }

    if (
      normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
    ) {
      forbidden(res)
      return true
    }

    const result = await createShiftUnbookRequestStatement.run(
      shiftAction.id,
      authUser.id,
      authUser.name,
    )
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.unbook_request',
      before: shift,
      context: { requestId: Number(result.lastInsertRowid) },
    })
    const scheduleManagers = await getScheduleManagerIds(authUser.id)
    await notifyUsers(
      scheduleManagers,
      'shifts',
      buildPushPayload({
        title: 'Заявка на снятие со смены',
        body: `${authUser.name}: ${formatShiftLabel(shift)}`,
        url: '/schedule',
        tag: `shift-unbook-request-${shiftAction.id}-${authUser.id}`,
        urgency: 'high',
      }),
    )

    json(res, 201, {
      request: toUnbookRequestDto({
        id: Number(result.lastInsertRowid),
        shift_id: shiftAction.id,
        requester_user_id: authUser.id,
        requester_name: authUser.name,
        status: 'pending',
        created_at: new Date().toISOString(),
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        employee_name: shift.employee_name,
      }),
    })
    return true
  }

  if (req.method === 'PATCH' && shiftAction.action === 'book') {
    if (shift.employee_name) {
      badRequest(res, 'Смена уже занята')
      return true
    }

    await updateShiftEmployeeStatement.run(authUser.name, shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.book',
      before: shift,
      after: { ...shift, employee_name: authUser.name },
    })
    const scheduleManagers = await getScheduleManagerIds(authUser.id)
    await notifyUsers(
      scheduleManagers,
      'shifts',
      buildPushPayload({
        title: 'Смена занята',
        body: `${authUser.name}: ${formatShiftLabel(shift)}`,
        url: '/schedule',
        tag: `shift-booked-${shiftAction.id}`,
      }),
    )
    json(res, 200, { ok: true })
    return true
  }

  if (req.method === 'PATCH' && shiftAction.action === 'assign') {
    const authPermissions = await getUserPermissions(authUser)
    if (!authPermissions.scheduleManage) {
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

    await updateShiftEmployeeStatement.run(targetUser.name, shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.assign',
      before: shift,
      after: { ...shift, employee_name: targetUser.name },
      context: { assignedUserId: targetUser.id, assignedUserName: targetUser.name },
    })

    if (targetUser.id !== authUser.id) {
      await notifyUsers(
        [targetUser.id],
        'shifts',
        buildPushPayload({
          title: 'Вас поставили на смену',
          body: `${formatShiftLabel(shift)}. Назначил: ${authUser.name}`,
          url: '/schedule',
          tag: `shift-assigned-${shiftAction.id}`,
          urgency: 'high',
        }),
      )
    }

    json(res, 200, { ok: true, employee_name: targetUser.name })
    return true
  }

  if (req.method === 'PATCH' && !shiftAction.action) {
    const authPermissions = await getUserPermissions(authUser)
    if (!authPermissions.scheduleManage) {
      forbidden(res)
      return true
    }

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

    await updateShiftDetailsStatement.run(date, startTime, endTime, shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.update',
      before: shift,
      after: { ...shift, date, start_time: startTime, end_time: endTime },
    })
    if (
      shift.employee_name &&
      normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
    ) {
      await notifyUserByName(
        shift.employee_name,
        'shifts',
        buildPushPayload({
          title: 'Смена изменена',
          body: `Новая дата или время: ${date} ${startTime}-${endTime}`,
          url: '/schedule',
          tag: `shift-updated-${shiftAction.id}`,
          urgency: 'high',
        }),
      )
    }
    json(res, 200, { ok: true })
    return true
  }

  if (req.method === 'PATCH' && shiftAction.action === 'unbook') {
    const authPermissions = await getUserPermissions(authUser)
    if (!authPermissions.scheduleManage) {
      forbidden(res)
      return true
    }

    await updateShiftEmployeeStatement.run(null, shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.unbook',
      before: shift,
      after: { ...shift, employee_name: null },
    })
    if (authPermissions.scheduleManage) {
      await notifyShiftDeleted({
        shift,
        actorUser: authUser,
        tagId: shiftAction.id,
        title: 'С вас сняли смену',
      })
    }
    json(res, 200, { ok: true })
    return true
  }

  if (req.method === 'PATCH' && shiftAction.action === 'approve') {
    const authPermissions = await getUserPermissions(authUser)
    if (!authPermissions.scheduleManage) {
      forbidden(res)
      return true
    }

    await updateShiftStatusStatement.run('approved', shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.approve',
      before: shift,
      after: { ...shift, status: 'approved' },
    })
    if (shift.created_by) {
      await notifyUsers(
        [shift.created_by],
        'shifts',
        buildPushPayload({
          title: 'Заявка на смену подтверждена',
          body: `${shift.date} ${shift.start_time}-${shift.end_time}`,
          url: '/schedule',
          tag: `shift-approved-${shiftAction.id}`,
          urgency: 'high',
        }),
      )
    }
    json(res, 200, { ok: true })
    return true
  }

  if (req.method === 'DELETE' && !shiftAction.action) {
    const authPermissions = await getUserPermissions(authUser)
    if (!authPermissions.scheduleManage) {
      forbidden(res)
      return true
    }

    await deleteShiftStatement.run(authUser.id, 'single_delete', shiftAction.id)
    await touchResource('schedule', authUser)
    await logAudit({
      actorUser: authUser,
      entityType: 'shift',
      entityId: shiftAction.id,
      action: 'shift.delete',
      before: shift,
    })
    if (shift.status === 'pending' && shift.created_by) {
      await notifyUsers(
        [shift.created_by],
        'shifts',
        buildPushPayload({
          title: 'Заявка на смену отклонена',
          body: `${shift.date} ${shift.start_time}-${shift.end_time}`,
          url: '/schedule',
          tag: `shift-rejected-${shiftAction.id}`,
          urgency: 'high',
        }),
      )
    } else {
      await notifyShiftDeleted({ shift, actorUser: authUser, tagId: shiftAction.id })
    }
    json(res, 200, { ok: true })
    return true
  }

  return false
}
