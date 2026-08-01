import { HttpError } from '../errors.js'
import { CALENDAR_ASSISTANT_CONTEXT_LIMITS } from './calendar-system-prompt.js'
import { parseAssistantJsonContent } from './json-response.js'

const MAX_ACTIONS = 12
const MAX_REPLY_LENGTH = 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/

const invalidAction = (message) => {
  throw new HttpError(502, message, 'AI_INVALID_ACTION')
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const hasExactKeys = (value, keys) =>
  isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

const firstValue = (value, keys) => keys.map((key) => value?.[key]).find((item) => item !== undefined)
const asInteger = (value) => {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : value
}

const normalizeCalendarAction = (raw) => {
  if (!isObject(raw)) return raw
  const type = firstValue(raw, ['type', 'action', 'operation'])
  if (type === 'create_event' || type === 'create' || type === 'add_event') {
    return {
      type: 'create_event',
      date: firstValue(raw, ['date', 'event_date', 'eventDate']),
      title: firstValue(raw, ['title', 'name', 'subject']),
      description: firstValue(raw, ['description', 'details', 'note']) ?? null,
      start_time: firstValue(raw, ['start_time', 'startTime', 'from']) ?? null,
      end_time: firstValue(raw, ['end_time', 'endTime', 'to']) ?? null,
    }
  }
  if (type === 'update_event' || type === 'update' || type === 'edit_event') {
    return {
      type: 'update_event',
      event_id: asInteger(firstValue(raw, ['event_id', 'eventId', 'id'])),
      date: firstValue(raw, ['date', 'event_date', 'eventDate']),
      title: firstValue(raw, ['title', 'name', 'subject']),
      description: firstValue(raw, ['description', 'details', 'note']) ?? null,
      start_time: firstValue(raw, ['start_time', 'startTime', 'from']) ?? null,
      end_time: firstValue(raw, ['end_time', 'endTime', 'to']) ?? null,
    }
  }
  if (type === 'delete_event' || type === 'delete' || type === 'remove_event') {
    return { type: 'delete_event', event_id: asInteger(firstValue(raw, ['event_id', 'eventId', 'id'])) }
  }
  return raw
}

const normalizeCalendarPayload = (payload) => {
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

const validDate = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const validTime = (value) => {
  if (typeof value !== 'string') return false
  const match = TIME_PATTERN.exec(value)
  if (!match) return false
  return Number(match[1]) <= 23 && Number(match[2]) <= 59
}

const validateEventFields = (action) => {
  if (!validDate(action.date) || typeof action.title !== 'string' || !action.title.trim() || action.title.length > 160) {
    invalidAction('ИИ вернул некорректную дату или название события.')
  }
  if (action.description !== null && (typeof action.description !== 'string' || action.description.length > 1000)) {
    invalidAction('ИИ вернул некорректное описание события.')
  }
  if ((action.start_time === null) !== (action.end_time === null)) {
    invalidAction('Для события нужно указать оба времени или не указывать время.')
  }
  if (action.start_time !== null && (!validTime(action.start_time) || !validTime(action.end_time) || action.start_time >= action.end_time)) {
    invalidAction('ИИ вернул некорректный диапазон времени события.')
  }
}

const validateEventId = (id, knownEventIds) => {
  if (!Number.isSafeInteger(id) || !knownEventIds.has(id)) {
    invalidAction('ИИ выбрал событие, которого нет в текущем календаре.')
  }
}

const normalizeFields = (action) => ({
  date: action.date,
  title: action.title.trim(),
  description: action.description?.trim() || null,
  startTime: action.start_time,
  endTime: action.end_time,
})

export const parseCalendarJsonResponse = ({ message, events, canManageCalendar }) => {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (!content || content.length > 10_000) invalidAction('ИИ не вернул JSON-ответ.')
  const parsedPayload = parseAssistantJsonContent(content)
  if (!parsedPayload) invalidAction('ИИ вернул ответ не в формате JSON.')
  const payload = normalizeCalendarPayload(parsedPayload)
  if (!hasExactKeys(payload, ['reply', 'actions']) || !Array.isArray(payload.actions) || payload.actions.length > MAX_ACTIONS) {
    invalidAction('ИИ вернул неполный список действий календаря.')
  }
  if (typeof payload.reply !== 'string' || !payload.reply.trim() || payload.reply.trim().length > MAX_REPLY_LENGTH) {
    invalidAction('ИИ вернул недопустимый текст ответа.')
  }
  if (payload.actions.length && !canManageCalendar) {
    invalidAction('ИИ вернул действие, доступное только управляющему календарём.')
  }
  const knownEventIds = new Set(events.slice(0, CALENDAR_ASSISTANT_CONTEXT_LIMITS.events).map((event) => Number(event.id)))
  const seenIds = new Set()
  const actions = []
  const skippedActions = []
  for (const [index, rawAction] of payload.actions.entries()) {
    const seenSnapshot = new Set(seenIds)
    try {
      const action = normalizeCalendarAction(rawAction)
      if (!isObject(action) || typeof action.type !== 'string') invalidAction('ИИ вернул некорректное действие календаря.')
      if (action.type === 'create_event') {
        if (!hasExactKeys(action, ['type', 'date', 'title', 'description', 'start_time', 'end_time'])) invalidAction('ИИ вернул неполное действие создания события.')
        validateEventFields(action)
        actions.push({ type: 'create_event', ...normalizeFields(action) })
      } else if (action.type === 'update_event') {
        if (!hasExactKeys(action, ['type', 'event_id', 'date', 'title', 'description', 'start_time', 'end_time'])) invalidAction('ИИ вернул неполное действие изменения события.')
        validateEventId(action.event_id, knownEventIds)
        if (seenIds.has(action.event_id)) invalidAction('ИИ вернул несколько действий для одного события.')
        seenIds.add(action.event_id)
        validateEventFields(action)
        actions.push({ type: 'update_event', eventId: action.event_id, ...normalizeFields(action) })
      } else if (action.type === 'delete_event') {
        if (!hasExactKeys(action, ['type', 'event_id'])) invalidAction('ИИ вернул неполное действие удаления события.')
        validateEventId(action.event_id, knownEventIds)
        if (seenIds.has(action.event_id)) invalidAction('ИИ вернул несколько действий для одного события.')
        seenIds.add(action.event_id)
        actions.push({ type: 'delete_event', eventId: action.event_id })
      } else {
        invalidAction('ИИ запросил недопустимое действие календаря.')
      }
    } catch (error) {
      if (payload.actions.length <= 1) throw error
      seenIds.clear()
      for (const eventId of seenSnapshot) seenIds.add(eventId)
      skippedActions.push({
        index: index + 1,
        code: error?.code || 'AI_INVALID_ACTION',
        reason: String(error?.message || 'Действие не выполнено.').slice(0, 300),
      })
    }
  }
  const result = { reply: payload.reply.trim(), actions }
  return skippedActions.length ? { ...result, skippedActions } : result
}
