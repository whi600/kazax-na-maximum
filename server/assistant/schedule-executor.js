import { formatShiftLabel, isValidShiftRange, notifyNewFreeShifts } from '../api-utils.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { buildPushPayload, notifyUserByName, notifyUsers } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  getShiftByIdStatement,
  getUserByIdStatement,
  insertShiftStatement,
  listEmployeeUsersStatement,
  updateShiftDetailsStatement,
  updateShiftEmployeeStatement,
} from '../statements.js'
import {
  getResourceRevision,
  withVersionedMutation,
} from '../services/mutation-service.js'
import { getScheduleManagerIds, isShiftEnded } from '../routes/shift-route-utils.js'

const RESOURCE = 'schedule'

const isApprovedShift = (shift) => (shift?.status || 'approved') === 'approved'

const isFutureShiftRange = ({ date, endTime }) =>
  new Date(`${date}T${endTime}`) > new Date()

const requireScheduleManager = (permissions) => {
  if (!permissions?.scheduleManage) {
    throw new HttpError(403, 'Недостаточно прав для изменения расписания.', 'FORBIDDEN')
  }
}

const requireFutureShiftInput = ({ date, startTime, endTime }) => {
  if (
    !isValidShiftRange(startTime, endTime) ||
    !isFutureShiftRange({ date, endTime })
  ) {
    throw new HttpError(400, 'Нельзя изменить прошедшую смену.', 'SHIFT_ENDED')
  }
}

const getFreeFutureShift = async (client, shiftId) => {
  const shift = await getShiftByIdStatement.getOn(client, shiftId)
  if (!shift) throw new HttpError(404, 'Смена не найдена.', 'SHIFT_NOT_FOUND')
  if (!isApprovedShift(shift)) {
    throw new HttpError(400, 'Эта смена пока недоступна.', 'SHIFT_NOT_APPROVED')
  }
  if (shift.employee_name) {
    throw new HttpError(400, 'Смена уже занята.', 'SHIFT_ALREADY_ASSIGNED')
  }
  if (isShiftEnded(shift)) {
    throw new HttpError(400, 'Нельзя выбрать прошедшую смену.', 'SHIFT_ENDED')
  }
  return shift
}

const getEditableShift = async (client, shiftId) => {
  const shift = await getShiftByIdStatement.getOn(client, shiftId)
  if (!shift) throw new HttpError(404, 'Смена не найдена.', 'SHIFT_NOT_FOUND')
  if (!isApprovedShift(shift)) {
    throw new HttpError(400, 'Эта смена пока недоступна.', 'SHIFT_NOT_APPROVED')
  }
  if (isShiftEnded(shift)) {
    throw new HttpError(400, 'Нельзя изменить прошедшую смену.', 'SHIFT_ENDED')
  }
  return shift
}

const getAssignee = async (client, userId) => {
  const targetUser = await getUserByIdStatement.getOn(client, userId)
  if (!targetUser) {
    throw new HttpError(404, 'Сотрудник не найден.', 'USER_NOT_FOUND')
  }
  return targetUser
}

const notifyAssignment = async ({ shift, targetUser, actorUser, tagId }) => {
  if (Number(targetUser.id) === Number(actorUser.id)) return
  await notifyUsers(
    [targetUser.id],
    'shifts',
    buildPushPayload({
      title: 'Вас поставили на смену',
      body: `${formatShiftLabel(shift)}. Назначил: ${actorUser.name}`,
      url: '/schedule',
      tag: `shift-assigned-${tagId}`,
      urgency: 'high',
    }),
  )
}

const notifyUpdatedShift = async ({ shift, actorUser, tagId }) => {
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
      title: 'Смена изменена',
      body: `Новая дата или время: ${formatShiftLabel(shift)}`,
      url: '/schedule',
      tag: `shift-updated-${tagId}`,
      urgency: 'high',
    }),
  )
}

const executeAction = async ({
  client,
  action,
  user,
  permissions,
  notifications,
}) => {
  if (action.type === 'book_shift') {
    const shift = await getFreeFutureShift(client, action.shiftId)
    await updateShiftEmployeeStatement.runOn(client, user.name, user.id, action.shiftId)
    const updatedShift = {
      ...shift,
      employee_name: user.name,
      employee_user_id: user.id,
    }
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: action.shiftId,
      action: 'shift.book',
      before: shift,
      after: updatedShift,
      context: { source: 'assistant' },
      client,
    })
    notifications.booked.push(updatedShift)
    return action
  }

  requireScheduleManager(permissions)

  if (action.type === 'create_shift') {
    requireFutureShiftInput(action)
    const assignee = action.assigneeUserId === null
      ? null
      : await getAssignee(client, action.assigneeUserId)
    const inserted = await insertShiftStatement.runOn(
      client,
      action.date,
      action.startTime,
      action.endTime,
      assignee?.name || null,
      assignee?.id || null,
      'approved',
      user.id,
    )
    const createdShift = {
      id: Number(inserted.lastInsertRowid),
      date: action.date,
      start_time: action.startTime,
      end_time: action.endTime,
      employee_name: assignee?.name || null,
      employee_user_id: assignee?.id || null,
      status: 'approved',
    }
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: createdShift.id,
      action: 'shift.admin_create',
      after: createdShift,
      context: { source: 'assistant' },
      client,
    })
    if (assignee) notifications.assigned.push({ shift: createdShift, targetUser: assignee })
    else notifications.createdFree.push(createdShift)
    return { ...action, shiftId: createdShift.id }
  }

  if (action.type === 'update_shift') {
    requireFutureShiftInput(action)
    const shift = await getEditableShift(client, action.shiftId)
    await updateShiftDetailsStatement.runOn(
      client,
      action.date,
      action.startTime,
      action.endTime,
      action.shiftId,
    )
    const updatedShift = {
      ...shift,
      date: action.date,
      start_time: action.startTime,
      end_time: action.endTime,
    }
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: action.shiftId,
      action: 'shift.update',
      before: shift,
      after: updatedShift,
      context: { source: 'assistant' },
      client,
    })
    notifications.updated.push(updatedShift)
    return action
  }

  if (action.type === 'assign_shift') {
    const shift = await getFreeFutureShift(client, action.shiftId)
    const targetUser = await getAssignee(client, action.userId)
    await updateShiftEmployeeStatement.runOn(
      client,
      targetUser.name,
      targetUser.id,
      action.shiftId,
    )
    const updatedShift = {
      ...shift,
      employee_name: targetUser.name,
      employee_user_id: targetUser.id,
    }
    await logAudit({
      actorUser: user,
      entityType: 'shift',
      entityId: action.shiftId,
      action: 'shift.assign',
      before: shift,
      after: updatedShift,
      context: {
        source: 'assistant',
        assignedUserId: targetUser.id,
        assignedUserName: targetUser.name,
      },
      client,
    })
    notifications.assigned.push({ shift: updatedShift, targetUser })
    return action
  }

  throw new HttpError(400, 'Недопустимое действие с расписанием.', 'INVALID_ACTION')
}

const runIsolatedAction = async ({ client, index, execute }) => {
  const savepoint = `assistant_schedule_action_${index}`
  await client.query(`SAVEPOINT ${savepoint}`)
  try {
    const value = await execute()
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    return { ok: true, value }
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    } finally {
      await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    }
    return { ok: false, error }
  }
}

const failureDto = (error, index) => ({
  index: index + 1,
  code: error?.code || 'ACTION_FAILED',
  reason: String(error?.message || 'Действие не выполнено.').slice(0, 300),
})

export const executeScheduleAssistantActions = async ({
  db,
  user,
  permissions,
  actions,
  meta,
}) => {
  if (!actions.length) {
    return {
      actions: [],
      revision: await getResourceRevision(RESOURCE),
    }
  }

  const notifications = {
    createdFree: [],
    assigned: [],
    booked: [],
    updated: [],
  }
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'assistant', actions },
    execute: async (client) => {
      const appliedActions = []
      const skippedActions = []
      for (const [index, action] of actions.entries()) {
        const notificationSnapshot = Object.fromEntries(
          Object.entries(notifications).map(([key, values]) => [key, values.length]),
        )
        const result = await runIsolatedAction({
          client,
          index,
          execute: () => executeAction({
            client,
            action,
            user,
            permissions,
            notifications,
          }),
        })
        if (result.ok) {
          appliedActions.push(result.value)
          continue
        }
        for (const [key, length] of Object.entries(notificationSnapshot)) {
          notifications[key].length = length
        }
        skippedActions.push(failureDto(result.error, index))
      }
      return { payload: { actions: appliedActions, skippedActions } }
    },
  })

  if (!result.replayed) {
    await notifyNewFreeShifts({
      shifts: notifications.createdFree,
      actorUser: user,
      listEmployeeUsersStatement,
    })
    for (const assignment of notifications.assigned) {
      await notifyAssignment({
        ...assignment,
        actorUser: user,
        tagId: assignment.shift.id,
      })
    }
    for (const shift of notifications.booked) {
      await notifyUsers(
        await getScheduleManagerIds(user.id),
        'shifts',
        buildPushPayload({
          title: 'Смена занята',
          body: `${user.name}: ${formatShiftLabel(shift)}`,
          url: '/schedule',
          tag: `shift-booked-${shift.id}`,
        }),
      )
    }
    for (const shift of notifications.updated) {
      await notifyUpdatedShift({ shift, actorUser: user, tagId: shift.id })
    }
  }

  return result.payload
}
