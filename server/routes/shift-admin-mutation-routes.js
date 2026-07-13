import { requirePermission } from '../auth.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { badRequest, json, readJsonBody } from '../http.js'
import { buildPushPayload, notifyUserByName, notifyUsers } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import {
  deleteShiftStatement,
  getShiftByIdStatement,
  insertShiftStatement,
  listEmployeeUsersStatement,
  updateShiftDetailsStatement,
} from '../statements.js'
import {
  isValidShiftRange,
  notifyNewFreeShifts,
  parseShiftId,
} from '../api-utils.js'
import {
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'
import { notifyShiftDeleted } from './shift-route-utils.js'

const RESOURCE = 'schedule'

const parseShiftInput = (body) => ({
  date: String(body.date || ''),
  startTime: String(body.start_time || ''),
  endTime: String(body.end_time || ''),
})

const validateShiftInput = ({ date, startTime, endTime }) => {
  if (!date || !startTime || !endTime) return 'Заполните дату и время'
  if (!isValidShiftRange(startTime, endTime)) {
    return 'Время окончания должно быть позже начала'
  }
  return ''
}

const handleAdminCreate = async ({ req, res, db }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const body = await readJsonBody(req)
  const input = parseShiftInput(body)
  const validationError = validateShiftInput(input)
  if (validationError) {
    badRequest(res, validationError)
    return true
  }

  const meta = parseMutationMeta(req, body)
  let createdShift = null
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'admin_create', ...input },
    execute: async (client, { currentRevision }) => {
      const inserted = await insertShiftStatement.runOn(
        client,
        input.date,
        input.startTime,
        input.endTime,
        null,
        'approved',
        user.id,
      )
      createdShift = {
        id: Number(inserted.lastInsertRowid),
        date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
        employee_name: null,
        status: 'approved',
      }
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: createdShift.id,
        action: 'shift.admin_create',
        after: createdShift,
        context: meta.force && meta.baseRevision !== currentRevision
          ? { conflictResolution: 'force' }
          : null,
        client,
      })
      return { statusCode: 201, payload: { id: createdShift.id } }
    },
  })

  if (!result.replayed && createdShift) {
    await notifyNewFreeShifts({
      shifts: [createdShift],
      actorUser: user,
      listEmployeeUsersStatement,
    })
  }
  json(res, result.statusCode, result.payload)
  return true
}

const handleShiftUpdate = async ({ req, res, db, shiftId }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const body = await readJsonBody(req)
  const input = parseShiftInput(body)
  const validationError = validateShiftInput(input)
  if (validationError) {
    badRequest(res, validationError)
    return true
  }

  const meta = parseMutationMeta(req, body)
  let updatedShift = null
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'update', shiftId, ...input },
    execute: async (client, { currentRevision }) => {
      const existing = await getShiftByIdStatement.getOn(client, shiftId)
      if (!existing) throw new HttpError(404, 'Смена не найдена', 'SHIFT_NOT_FOUND')
      await updateShiftDetailsStatement.runOn(
        client,
        input.date,
        input.startTime,
        input.endTime,
        shiftId,
      )
      updatedShift = {
        ...existing,
        date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
      }
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: shiftId,
        action: 'shift.update',
        before: existing,
        after: updatedShift,
        context: meta.force && meta.baseRevision !== currentRevision
          ? { conflictResolution: 'force' }
          : null,
        client,
      })
      return { payload: { ok: true } }
    },
  })

  if (
    !result.replayed &&
    updatedShift?.employee_name &&
    normalizePersonName(updatedShift.employee_name) !== normalizePersonName(user.name)
  ) {
    await notifyUserByName(
      updatedShift.employee_name,
      'shifts',
      buildPushPayload({
        title: 'Смена изменена',
        body: `Новая дата или время: ${input.date} ${input.startTime}-${input.endTime}`,
        url: '/schedule',
        tag: `shift-updated-${shiftId}`,
        urgency: 'high',
      }),
    )
  }
  json(res, result.statusCode, result.payload)
  return true
}

const handleShiftDelete = async ({ req, res, db, shiftId }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const meta = parseMutationMeta(req)
  let deletedShift = null
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'delete', shiftId },
    execute: async (client, { currentRevision }) => {
      deletedShift = await getShiftByIdStatement.getOn(client, shiftId)
      if (!deletedShift) throw new HttpError(404, 'Смена не найдена', 'SHIFT_NOT_FOUND')
      await deleteShiftStatement.runOn(client, user.id, 'single_delete', shiftId)
      await logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: shiftId,
        action: 'shift.delete',
        before: deletedShift,
        context: meta.force && meta.baseRevision !== currentRevision
          ? { conflictResolution: 'force' }
          : null,
        client,
      })
      return { payload: { ok: true } }
    },
  })

  if (!result.replayed && deletedShift) {
    if (deletedShift.status === 'pending' && deletedShift.created_by) {
      await notifyUsers(
        [deletedShift.created_by],
        'shifts',
        buildPushPayload({
          title: 'Заявка на смену отклонена',
          body: `${deletedShift.date} ${deletedShift.start_time}-${deletedShift.end_time}`,
          url: '/schedule',
          tag: `shift-rejected-${shiftId}`,
          urgency: 'high',
        }),
      )
    } else {
      await notifyShiftDeleted({ shift: deletedShift, actorUser: user, tagId: shiftId })
    }
  }
  json(res, result.statusCode, result.payload)
  return true
}

export const handleShiftAdminMutationRoutes = async (context) => {
  const { req, pathname } = context
  if (pathname === '/api/shifts/admin-create' && req.method === 'POST') {
    return handleAdminCreate(context)
  }

  const shiftAction = parseShiftId(pathname)
  if (!shiftAction || shiftAction.action) return false
  if (req.method === 'PATCH') {
    return handleShiftUpdate({ ...context, shiftId: shiftAction.id })
  }
  if (req.method === 'DELETE') {
    return handleShiftDelete({ ...context, shiftId: shiftAction.id })
  }
  return false
}
