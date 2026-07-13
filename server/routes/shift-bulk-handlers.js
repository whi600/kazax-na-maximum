import { requirePermission } from '../auth.js'
import { logAudit } from '../audit.js'
import { json, readJsonBody } from '../http.js'
import { notifyNewFreeShifts } from '../api-utils.js'
import {
  deleteShiftStatement,
  getShiftByIdStatement,
  insertShiftStatement,
  listEmployeeUsersStatement,
} from '../statements.js'
import { isValidShiftRange } from '../api-utils.js'
import { notifyShiftDeleted } from './shift-route-utils.js'
import {
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'

const RESOURCE = 'schedule'

export const handleBulkSaveShifts = async ({ req, res, db }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access

  const body = await readJsonBody(req)
  const meta = parseMutationMeta(req, body)
  const deletedIds = Array.isArray(body.deletedIds) ? body.deletedIds : []
  const newShifts = Array.isArray(body.newShifts) ? body.newShifts : []

  let effects = null
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'bulk_save', deletedIds, newShifts },
    execute: async (client, { currentRevision }) => {
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

      effects = { deletedSnapshot, createdShifts }
      if (deletedSnapshot.length > 0 || createdIds.length > 0) {
        const forced = meta.force && meta.baseRevision !== currentRevision
        await logAudit({
          actorUser: user,
          entityType: 'shift',
          action: 'shift.bulk_save',
          before: { deleted: deletedSnapshot },
          after: { createdIds, createdCount: createdIds.length },
          context: {
            deletedCount: deletedSnapshot.length,
            createdCount: createdIds.length,
            ...(forced ? { conflictResolution: 'force' } : {}),
          },
          client,
        })
      }
      return { payload: { ok: true, createdIds } }
    },
  })

  if (!result.replayed && effects) {
    await notifyNewFreeShifts({
      shifts: effects.createdShifts,
      actorUser: user,
      listEmployeeUsersStatement,
    })
    await Promise.all(
      effects.deletedSnapshot.map((shift) =>
        notifyShiftDeleted({ shift, actorUser: user, tagId: shift.id }),
      ),
    )
  }

  json(res, result.statusCode, result.payload)
  return true
}
