import { requirePermission } from '../auth.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { badRequest, json, readJsonBody } from '../http.js'
import {
  deleteCalendarEventStatement,
  getCalendarEventByIdStatement,
  insertCalendarEventStatement,
  updateCalendarEventStatement,
} from '../statements.js'
import {
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'

const RESOURCE = 'calendar'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/

const isValidDate = (value) => {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const isValidTime = (value) => {
  const match = TIME_PATTERN.exec(value)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

export const toCalendarEventDto = (row) => ({
  id: Number(row.id),
  date: row.event_date,
  title: row.title,
  description: row.description || '',
  start_time: row.start_time || null,
  end_time: row.end_time || null,
  created_by: row.created_by ?? null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
})

export const parseCalendarEventInput = (body) => {
  const date = String(body.date || '').trim()
  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const startTime = String(body.start_time || '').trim()
  const endTime = String(body.end_time || '').trim()

  if (!isValidDate(date)) return { error: 'Укажите корректную дату события' }
  if (!title || title.length > 160) return { error: 'Название события должно быть от 1 до 160 символов' }
  if (description.length > 1_000) return { error: 'Описание события слишком длинное' }
  if (Boolean(startTime) !== Boolean(endTime)) {
    return { error: 'Укажите оба времени или оставьте время пустым' }
  }
  if (
    (startTime && !isValidTime(startTime)) ||
    (endTime && !isValidTime(endTime)) ||
    (startTime && endTime && startTime >= endTime)
  ) {
    return { error: 'Проверьте время события' }
  }

  return {
    date,
    title,
    description: description || null,
    startTime: startTime || null,
    endTime: endTime || null,
  }
}

const getEventId = (pathname) => {
  const match = pathname.match(/^\/api\/calendar\/events\/(\d+)$/)
  return match ? Number(match[1]) : null
}

const handleCreate = async ({ req, res, db }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const body = await readJsonBody(req)
  const input = parseCalendarEventInput(body)
  if (input.error) {
    badRequest(res, input.error)
    return true
  }
  const meta = parseMutationMeta(req, body)
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'create', input },
    execute: async (client) => {
      const inserted = await insertCalendarEventStatement.runOn(
        client,
        input.date,
        input.title,
        input.description,
        input.startTime,
        input.endTime,
        user.id,
      )
      const event = await getCalendarEventByIdStatement.getOn(client, Number(inserted.lastInsertRowid))
      await logAudit({
        actorUser: user,
        entityType: 'calendar_event',
        entityId: event.id,
        action: 'calendar_event.create',
        after: event,
        client,
      })
      return { statusCode: 201, payload: { event: toCalendarEventDto(event) } }
    },
  })
  json(res, result.statusCode, result.payload)
  return true
}

const handleUpdate = async ({ req, res, db, eventId }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const body = await readJsonBody(req)
  const input = parseCalendarEventInput(body)
  if (input.error) {
    badRequest(res, input.error)
    return true
  }
  const meta = parseMutationMeta(req, body)
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'update', eventId, input },
    execute: async (client) => {
      const existing = await getCalendarEventByIdStatement.getOn(client, eventId)
      if (!existing) throw new HttpError(404, 'Событие не найдено', 'CALENDAR_EVENT_NOT_FOUND')
      await updateCalendarEventStatement.runOn(
        client,
        input.date,
        input.title,
        input.description,
        input.startTime,
        input.endTime,
        eventId,
      )
      const event = await getCalendarEventByIdStatement.getOn(client, eventId)
      await logAudit({
        actorUser: user,
        entityType: 'calendar_event',
        entityId: eventId,
        action: 'calendar_event.update',
        before: existing,
        after: event,
        client,
      })
      return { payload: { event: toCalendarEventDto(event) } }
    },
  })
  json(res, result.statusCode, result.payload)
  return true
}

const handleDelete = async ({ req, res, db, eventId }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const meta = parseMutationMeta(req)
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'delete', eventId },
    execute: async (client) => {
      const existing = await getCalendarEventByIdStatement.getOn(client, eventId)
      if (!existing) throw new HttpError(404, 'Событие не найдено', 'CALENDAR_EVENT_NOT_FOUND')
      await deleteCalendarEventStatement.runOn(client, eventId)
      await logAudit({
        actorUser: user,
        entityType: 'calendar_event',
        entityId: eventId,
        action: 'calendar_event.delete',
        before: existing,
        client,
      })
      return { payload: { ok: true } }
    },
  })
  json(res, result.statusCode, result.payload)
  return true
}

export const handleCalendarEventRoutes = async (context) => {
  const { req, res, pathname } = context
  if (pathname === '/api/calendar/events' && req.method === 'POST') return handleCreate(context)
  const eventId = getEventId(pathname)
  if (!eventId) return false
  if (req.method === 'PATCH') return handleUpdate({ ...context, eventId })
  if (req.method === 'DELETE') return handleDelete({ ...context, eventId })
  return false
}
