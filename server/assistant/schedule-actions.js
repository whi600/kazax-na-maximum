import { HttpError } from '../errors.js'
import { parseAssistantJsonContent } from './json-response.js'
import { SCHEDULE_ASSISTANT_CONTEXT_LIMITS } from './schedule-system-prompt.js'

const MAX_ACTIONS = 12
const MAX_REPLY_LENGTH = 1_000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/
const isValidShiftRange = (startTime, endTime) =>
  Boolean(startTime && endTime && startTime < endTime)

const invalidAction = (message) => {
  throw new HttpError(502, message, 'AI_INVALID_ACTION')
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value, keys) =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))

const firstValue = (value, keys) => keys.map((key) => value?.[key]).find((item) => item !== undefined)
const asInteger = (value) => {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : value
}

const normalizeScheduleAction = (raw) => {
  if (!isPlainObject(raw)) return raw
  const type = firstValue(raw, ['type', 'action', 'operation'])
  if (type === 'book_shift' || type === 'book' || type === 'take_shift') {
    return { type: 'book_shift', shift_id: asInteger(firstValue(raw, ['shift_id', 'shiftId', 'id'])) }
  }
  if (type === 'create_shift' || type === 'create' || type === 'add_shift') {
    return {
      type: 'create_shift',
      date: firstValue(raw, ['date', 'shift_date', 'shiftDate']),
      start_time: firstValue(raw, ['start_time', 'startTime', 'from']),
      end_time: firstValue(raw, ['end_time', 'endTime', 'to']),
      assignee_user_id: asInteger(firstValue(raw, ['assignee_user_id', 'assigneeUserId', 'user_id', 'userId']) ?? null),
    }
  }
  if (type === 'update_shift' || type === 'update' || type === 'edit_shift') {
    return {
      type: 'update_shift',
      shift_id: asInteger(firstValue(raw, ['shift_id', 'shiftId', 'id'])),
      date: firstValue(raw, ['date', 'shift_date', 'shiftDate']),
      start_time: firstValue(raw, ['start_time', 'startTime', 'from']),
      end_time: firstValue(raw, ['end_time', 'endTime', 'to']),
    }
  }
  if (type === 'assign_shift' || type === 'assign' || type === 'set_assignee') {
    return {
      type: 'assign_shift',
      shift_id: asInteger(firstValue(raw, ['shift_id', 'shiftId', 'id'])),
      user_id: asInteger(firstValue(raw, ['user_id', 'userId', 'assignee_user_id', 'assigneeUserId'])),
    }
  }
  return raw
}

const normalizeSchedulePayload = (payload) => {
  const actions = Array.isArray(payload?.actions)
    ? payload.actions
    : Array.isArray(payload?.updates)
      ? payload.updates
      : Array.isArray(payload?.operations)
        ? payload.operations
        : null
  if (!actions) return payload
  return {
    reply: firstValue(payload, ['reply', 'response', 'message']) || 'Готово.',
    actions,
  }
}

const isValidDateKey = (value) => {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

const isValidTime = (value) => {
  const match = TIME_PATTERN.exec(value)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

const validateShiftTiming = ({ date, startTime, endTime, today }) => {
  if (
    !isValidDateKey(date) ||
    !isValidTime(startTime) ||
    !isValidTime(endTime) ||
    !isValidShiftRange(startTime, endTime) ||
    (today && date < today)
  ) {
    invalidAction('ИИ вернул недопустимую дату или время смены.')
  }
}

const validateReply = (reply) => {
  if (
    typeof reply !== 'string' ||
    !reply.trim() ||
    reply.trim().length > MAX_REPLY_LENGTH
  ) {
    invalidAction('ИИ вернул недопустимый текст ответа.')
  }
  return reply.trim()
}

const validateShiftId = ({ shiftId, actionType, knownShiftIds, seenActions }) => {
  if (!Number.isSafeInteger(shiftId) || !knownShiftIds.has(shiftId)) {
    invalidAction('ИИ выбрал смену, которой нет в текущем расписании.')
  }
  const actionsForShift = seenActions.get(shiftId) || new Set()
  if (
    actionsForShift.has(actionType) ||
    (actionType === 'book_shift' && actionsForShift.size > 0) ||
    actionsForShift.has('book_shift')
  ) {
    invalidAction('ИИ вернул несколько одинаковых действий для одной смены.')
  }
  actionsForShift.add(actionType)
  seenActions.set(shiftId, actionsForShift)
}

const validateAssignee = ({ userId, knownUserIds }) => {
  if (userId === null) return null
  if (!Number.isSafeInteger(userId) || !knownUserIds.has(userId)) {
    invalidAction('ИИ выбрал сотрудника, которого нет в списке назначения.')
  }
  return userId
}

const validateRequiredUser = ({ userId, knownUserIds }) => {
  if (!Number.isSafeInteger(userId) || !knownUserIds.has(userId)) {
    invalidAction('ИИ выбрал сотрудника, которого нет в списке назначения.')
  }
  return userId
}

const validateAction = ({
  action,
  canManageSchedule,
  knownShiftIds,
  knownUserIds,
  seenActions,
  today,
}) => {
  if (!isPlainObject(action) || typeof action.type !== 'string') {
    invalidAction('ИИ вернул неполную команду для расписания.')
  }

  if (action.type === 'book_shift') {
    if (!hasExactKeys(action, ['type', 'shift_id'])) {
      invalidAction('ИИ вернул неполную команду занятия смены.')
    }
    validateShiftId({
      shiftId: action.shift_id,
      actionType: action.type,
      knownShiftIds,
      seenActions,
    })
    return { type: 'book_shift', shiftId: action.shift_id }
  }

  if (!canManageSchedule) {
    invalidAction('ИИ вернул действие, доступное только управляющему расписанием.')
  }

  if (action.type === 'create_shift') {
    if (
      !hasExactKeys(action, [
        'type',
        'date',
        'start_time',
        'end_time',
        'assignee_user_id',
      ])
    ) {
      invalidAction('ИИ вернул неполную команду создания смены.')
    }
    if (
      typeof action.date !== 'string' ||
      typeof action.start_time !== 'string' ||
      typeof action.end_time !== 'string'
    ) {
      invalidAction('ИИ вернул неполные данные новой смены.')
    }
    validateShiftTiming({
      date: action.date,
      startTime: action.start_time,
      endTime: action.end_time,
      today,
    })
    return {
      type: 'create_shift',
      date: action.date,
      startTime: action.start_time,
      endTime: action.end_time,
      assigneeUserId: validateAssignee({
        userId: action.assignee_user_id,
        knownUserIds,
      }),
    }
  }

  if (action.type === 'update_shift') {
    if (!hasExactKeys(action, ['type', 'shift_id', 'date', 'start_time', 'end_time'])) {
      invalidAction('ИИ вернул неполную команду изменения смены.')
    }
    if (
      typeof action.date !== 'string' ||
      typeof action.start_time !== 'string' ||
      typeof action.end_time !== 'string'
    ) {
      invalidAction('ИИ вернул неполные данные изменения смены.')
    }
    validateShiftId({
      shiftId: action.shift_id,
      actionType: action.type,
      knownShiftIds,
      seenActions,
    })
    validateShiftTiming({
      date: action.date,
      startTime: action.start_time,
      endTime: action.end_time,
      today,
    })
    return {
      type: 'update_shift',
      shiftId: action.shift_id,
      date: action.date,
      startTime: action.start_time,
      endTime: action.end_time,
    }
  }

  if (action.type === 'assign_shift') {
    if (!hasExactKeys(action, ['type', 'shift_id', 'user_id'])) {
      invalidAction('ИИ вернул неполную команду назначения сотрудника.')
    }
    validateShiftId({
      shiftId: action.shift_id,
      actionType: action.type,
      knownShiftIds,
      seenActions,
    })
    return {
      type: 'assign_shift',
      shiftId: action.shift_id,
      userId: validateRequiredUser({ userId: action.user_id, knownUserIds }),
    }
  }

  invalidAction('ИИ запросил недоступное действие с расписанием.')
}

export const parseScheduleJsonResponse = ({
  message,
  shifts,
  users,
  canManageSchedule,
  today,
}) => {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (!content || content.length > 10_000) {
    invalidAction('ИИ не вернул JSON-ответ.')
  }

  const parsedPayload = parseAssistantJsonContent(content)
  if (!parsedPayload) {
    invalidAction('ИИ вернул ответ не в формате JSON.')
  }

  const payload = normalizeSchedulePayload(parsedPayload)
  if (!hasExactKeys(payload, ['reply', 'actions'])) {
    invalidAction('ИИ вернул неполный JSON-ответ.')
  }
  if (!Array.isArray(payload.actions) || payload.actions.length > MAX_ACTIONS) {
    invalidAction('ИИ вернул недопустимый список действий со сменами.')
  }

  const visibleShifts = shifts.slice(0, SCHEDULE_ASSISTANT_CONTEXT_LIMITS.shifts)
  const visibleUsers = users.slice(0, SCHEDULE_ASSISTANT_CONTEXT_LIMITS.users)
  const knownShiftIds = new Set(
    visibleShifts
      .filter((shift) => (shift.status || 'approved') === 'approved')
      .map((shift) => Number(shift.id))
      .filter(Number.isSafeInteger),
  )
  const knownUserIds = new Set(
    visibleUsers.map((user) => Number(user.id)).filter(Number.isSafeInteger),
  )
  const seenActions = new Map()
  const actions = []
  const skippedActions = []
  for (const [index, rawAction] of payload.actions.entries()) {
    const seenSnapshot = new Map(
      [...seenActions.entries()].map(([shiftId, actionTypes]) => [shiftId, new Set(actionTypes)]),
    )
    try {
      actions.push(validateAction({
        action: normalizeScheduleAction(rawAction),
        canManageSchedule,
        knownShiftIds,
        knownUserIds,
        seenActions,
        today,
      }))
    } catch (error) {
      if (payload.actions.length <= 1) throw error
      seenActions.clear()
      for (const [shiftId, actionTypes] of seenSnapshot) seenActions.set(shiftId, actionTypes)
      skippedActions.push({
        index: index + 1,
        code: error?.code || 'AI_INVALID_ACTION',
        reason: String(error?.message || 'Действие не выполнено.').slice(0, 300),
      })
    }
  }

  const result = { reply: validateReply(payload.reply), actions }
  return skippedActions.length ? { ...result, skippedActions } : result
}
