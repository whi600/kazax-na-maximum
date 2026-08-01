import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import {
  deleteCalendarEventStatement,
  getCalendarEventByIdStatement,
  insertCalendarEventStatement,
  updateCalendarEventStatement,
} from '../statements.js'
import { getResourceRevision, withVersionedMutation } from '../services/mutation-service.js'
import { parseCalendarEventInput, toCalendarEventDto } from '../routes/calendar-event-routes.js'

const RESOURCE = 'calendar'

const requireCalendarManager = (permissions) => {
  if (!permissions?.scheduleManage) {
    throw new HttpError(403, 'Недостаточно прав для изменения календаря.', 'FORBIDDEN')
  }
}

const runIsolatedAction = async ({ client, index, execute }) => {
  const savepoint = `assistant_calendar_action_${index}`
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

export const executeCalendarAssistantActions = async ({ db, user, permissions, actions, meta }) => {
  if (!actions.length) return { actions: [], revision: await getResourceRevision(RESOURCE) }
  requireCalendarManager(permissions)

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
        const result = await runIsolatedAction({
          client,
          index,
          execute: async () => {
            if (action.type === 'create_event') {
              const input = parseCalendarEventInput({
                date: action.date,
                title: action.title,
                description: action.description,
                start_time: action.startTime,
                end_time: action.endTime,
              })
              if (input.error) throw new HttpError(400, input.error, 'INVALID_CALENDAR_EVENT')
              const inserted = await insertCalendarEventStatement.runOn(client, input.date, input.title, input.description, input.startTime, input.endTime, user.id)
              const event = await getCalendarEventByIdStatement.getOn(client, Number(inserted.lastInsertRowid))
              await logAudit({ actorUser: user, entityType: 'calendar_event', entityId: event.id, action: 'calendar_event.create', after: event, context: { source: 'assistant' }, client })
              return { ...action, event: toCalendarEventDto(event) }
            }

            const existing = await getCalendarEventByIdStatement.getOn(client, action.eventId)
            if (!existing) throw new HttpError(404, 'Событие не найдено.', 'CALENDAR_EVENT_NOT_FOUND')
            if (action.type === 'delete_event') {
              await deleteCalendarEventStatement.runOn(client, action.eventId)
              await logAudit({ actorUser: user, entityType: 'calendar_event', entityId: action.eventId, action: 'calendar_event.delete', before: existing, context: { source: 'assistant' }, client })
              return action
            }
            const input = parseCalendarEventInput({
              date: action.date,
              title: action.title,
              description: action.description,
              start_time: action.startTime,
              end_time: action.endTime,
            })
            if (input.error) throw new HttpError(400, input.error, 'INVALID_CALENDAR_EVENT')
            await updateCalendarEventStatement.runOn(client, input.date, input.title, input.description, input.startTime, input.endTime, action.eventId)
            const event = await getCalendarEventByIdStatement.getOn(client, action.eventId)
            await logAudit({ actorUser: user, entityType: 'calendar_event', entityId: action.eventId, action: 'calendar_event.update', before: existing, after: event, context: { source: 'assistant' }, client })
            return { ...action, event: toCalendarEventDto(event) }
          },
        })
        if (result.ok) appliedActions.push(result.value)
        else skippedActions.push(failureDto(result.error, index))
      }
      return { payload: { actions: appliedActions, skippedActions } }
    },
  })
  return result.payload
}
