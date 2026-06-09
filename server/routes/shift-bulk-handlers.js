import { requirePermission } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
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

export const handleBulkSaveShifts = async ({ req, res, db }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access

  const body = await readJsonBody(req)
  const deletedIds = Array.isArray(body.deletedIds) ? body.deletedIds : []
  const newShifts = Array.isArray(body.newShifts) ? body.newShifts : []

  const { deletedSnapshot, createdIds, createdShifts } = await db.transaction(
    async (client) => {
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
    },
  )

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
