import { getUserPermissions, requirePermission, requireUser } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
import { badRequest, forbidden, json, notFound, readJsonBody } from '../http.js'
import {
  buildPushPayload,
  notifyUserByName,
  notifyUsers,
} from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  deleteShiftStatement,
  getShiftByIdStatement,
  getUserByIdStatement,
  insertShiftStatement,
  listAllShiftsStatement,
  listEmployeeUsersStatement,
  listScheduleAssignableUsersStatement,
  listUpcomingShiftsStatement,
  listUsersWithScheduleManageStatement,
  updateShiftDetailsStatement,
  updateShiftEmployeeStatement,
  updateShiftStatusStatement,
} from '../statements.js'
import {
  formatShiftLabel,
  getCurrentWeekStartDate,
  isValidShiftRange,
  listUserIds,
  notifyNewFreeShifts,
  parseShiftId,
  toShiftDto,
} from '../api-utils.js'

const WEEK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const getScheduleManagerIds = async (excludeUserId = null) =>
  listUserIds(listUsersWithScheduleManageStatement, excludeUserId)

const addDaysToDateKey = (dateKey, amount) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

const isShiftEnded = (shift) => new Date(`${shift.date}T${shift.end_time}`) <= new Date()

const parseWeekDeletePath = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/week\/(\d{4}-\d{2}-\d{2})$/)
  return match ? match[1] : null
}

const notifyShiftDeleted = async ({ shift, actorUser, tagId, title = 'Смена удалена' }) => {
  if (
    !shift.employee_name ||
    normalizePersonName(shift.employee_name) === normalizePersonName(actorUser.name)
  ) {
    return
  }

  await notifyUserByName(
    shift.employee_name,
    'shifts',
    buildPushPayload({
      title,
      body: formatShiftLabel(shift),
      url: '/schedule',
      tag: `shift-deleted-${tagId}`,
      urgency: 'high',
    }),
  )
}

export const handleShiftRoutes = async ({ req, res, pathname, db }) => {
  if (pathname === '/api/shifts/upcoming' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const rows = await listUpcomingShiftsStatement.all(getCurrentWeekStartDate())
    json(res, 200, { shifts: rows.map(toShiftDto) })
    return true
  }

  if (pathname === '/api/shifts/archive' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const rows = await listAllShiftsStatement.all()
    json(res, 200, { shifts: rows.map(toShiftDto) })
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
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

    if (!WEEK_DATE_PATTERN.test(weekStartToDelete)) {
      badRequest(res, 'Некорректная неделя')
      return true
    }

    const weekEnd = addDaysToDateKey(weekStartToDelete, 6)
    const deletedSnapshot = await db.transaction(async (client) => {
      const shifts = (
        await client.query(
          `
            SELECT id, date, start_time, end_time, employee_name, status, created_by
            FROM shifts
            WHERE date >= $1
              AND date <= $2
              AND deleted_at IS NULL
            ORDER BY date ASC, start_time ASC
          `,
          [weekStartToDelete, weekEnd],
        )
      ).rows

      if (shifts.some((shift) => Boolean(shift.employee_name))) {
        const error = new Error('Нельзя удалить неделю: есть смены с записью сотрудников')
        error.statusCode = 400
        throw error
      }

      for (const shift of shifts) {
        await deleteShiftStatement.runOn(client, user.id, 'week_delete', shift.id)
      }

      return shifts
    }).catch((error) => {
      if (error.statusCode === 400) return error
      throw error
    })

    if (deletedSnapshot instanceof Error) {
      badRequest(res, deletedSnapshot.message)
      return true
    }

    await touchResource('schedule', user)
    if (deletedSnapshot.length > 0) {
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        action: 'shift.week_delete',
        before: { deleted: deletedSnapshot },
        context: {
          weekStart: weekStartToDelete,
          weekEnd,
          deletedCount: deletedSnapshot.length,
        },
      })
    }
    await Promise.all(
      deletedSnapshot.map((shift) =>
        notifyShiftDeleted({ shift, actorUser: user, tagId: shift.id }),
      ),
    )

    json(res, 200, { ok: true, deletedCount: deletedSnapshot.length })
    return true
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
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

    const body = await readJsonBody(req)
    const deletedIds = Array.isArray(body.deletedIds) ? body.deletedIds : []
    const newShifts = Array.isArray(body.newShifts) ? body.newShifts : []

    const { deletedSnapshot, createdIds, createdShifts } = await db.transaction(async (client) => {
      const deletedSnapshot = []
      for (const id of deletedIds) {
        const shiftId = Number(id)
        if (!Number.isFinite(shiftId)) continue
        const existingShift = await getShiftByIdStatement.getOn(client, shiftId)
        if (existingShift) deletedSnapshot.push(existingShift)
        await deleteShiftStatement.runOn(client, user.id, 'bulk_save', shiftId)
      }

      const createdIds = []
      const createdShifts = []
      for (const shift of newShifts) {
        const date = String(shift.date || '')
        const startTime = String(shift.start_time || '')
        const endTime = String(shift.end_time || '')
        if (!date || !startTime || !endTime) continue
        if (!isValidShiftRange(startTime, endTime)) continue

        const result = await insertShiftStatement.runOn(
          client,
          date,
          startTime,
          endTime,
          null,
          'approved',
          user.id,
        )
        const id = Number(result.lastInsertRowid)
        createdIds.push(id)
        createdShifts.push({
          id,
          date,
          start_time: startTime,
          end_time: endTime,
        })
      }

      return { deletedSnapshot, createdIds, createdShifts }
    })

    await touchResource('schedule', user)
    if (deletedSnapshot.length > 0 || createdIds.length > 0) {
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        action: 'shift.bulk_save',
        before: { deleted: deletedSnapshot },
        after: { createdIds, createdCount: createdIds.length },
        context: {
          deletedCount: deletedSnapshot.length,
          createdCount: createdIds.length,
        },
      })
    }
    await notifyNewFreeShifts({
      shifts: createdShifts,
      actorUser: user,
      listEmployeeUsersStatement,
    })
    await Promise.all(
      deletedSnapshot.map((shift) =>
        notifyShiftDeleted({ shift, actorUser: user, tagId: shift.id }),
      ),
    )

    json(res, 200, { ok: true, createdIds })
    return true
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

    const overlappingShift = (
      await db.query(
        `
          SELECT id, date, start_time, end_time, employee_name
          FROM shifts
          WHERE id <> $1
            AND date = $2
            AND deleted_at IS NULL
            AND status = 'approved'
            AND LOWER(TRIM(employee_name)) = LOWER(TRIM($3))
            AND start_time < $4
            AND end_time > $5
          LIMIT 1
        `,
        [shiftAction.id, shift.date, targetUser.name, shift.end_time, shift.start_time],
      )
    ).rows[0]

    if (overlappingShift) {
      badRequest(
        res,
        `У сотрудника уже есть смена ${overlappingShift.start_time}-${overlappingShift.end_time}`,
      )
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
    if (
      !authPermissions.scheduleManage &&
      normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
    ) {
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
