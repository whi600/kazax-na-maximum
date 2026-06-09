import { requirePermission } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
import { badRequest, json } from '../http.js'
import { deleteShiftStatement } from '../statements.js'
import {
  WEEK_DATE_PATTERN,
  addDaysToDateKey,
  notifyShiftDeleted,
} from './shift-route-utils.js'

export const handleDeleteShiftWeek = async ({ req, res, db, weekStart }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const { user } = access

  if (!WEEK_DATE_PATTERN.test(weekStart)) {
    badRequest(res, 'Некорректная неделя')
    return true
  }

  const weekEnd = addDaysToDateKey(weekStart, 6)
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
        [weekStart, weekEnd],
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
        weekStart,
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
