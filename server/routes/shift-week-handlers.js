import { requirePermission } from '../auth.js'
import { logAudit } from '../audit.js'
import { HttpError } from '../errors.js'
import { badRequest, json } from '../http.js'
import { deleteShiftStatement } from '../statements.js'
import {
  WEEK_DATE_PATTERN,
  addDaysToDateKey,
  notifyShiftDeleted,
} from './shift-route-utils.js'
import {
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'

const RESOURCE = 'schedule'

export const handleDeleteShiftWeek = async ({ req, res, db, weekStart }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access
  const meta = parseMutationMeta(req)

  if (!WEEK_DATE_PATTERN.test(weekStart)) {
    badRequest(res, 'Некорректная неделя')
    return true
  }

  const weekEnd = addDaysToDateKey(weekStart, 6)
  let deletedSnapshot = []
  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: 'week_delete', weekStart, weekEnd },
    execute: async (client, { currentRevision }) => {
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
          [weekStart, weekEnd],
        )
      ).rows

      if (shifts.some((shift) => Boolean(shift.employee_name))) {
        throw new HttpError(
          400,
          'Нельзя удалить неделю: есть смены с записью сотрудников',
          'WEEK_HAS_ASSIGNED_SHIFTS',
        )
      }

      for (const shift of shifts) {
        await deleteShiftStatement.runOn(client, user.id, 'week_delete', shift.id)
      }

      deletedSnapshot = shifts
      if (shifts.length > 0) {
        const forced = meta.force && meta.baseRevision !== currentRevision
        await logAudit({
          actorUser: user,
          entityType: 'shift',
          action: 'shift.week_delete',
          before: { deleted: shifts },
          context: {
            weekStart,
            weekEnd,
            deletedCount: shifts.length,
            ...(forced ? { conflictResolution: 'force' } : {}),
          },
          client,
        })
      }
      return { payload: { ok: true, deletedCount: shifts.length } }
    },
  })

  if (!result.replayed) {
    await Promise.all(
      deletedSnapshot.map((shift) =>
        notifyShiftDeleted({ shift, actorUser: user, tagId: shift.id }),
      ),
    )
  }

  json(res, result.statusCode, result.payload)
  return true
}
