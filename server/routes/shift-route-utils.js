import { formatShiftLabel, listUserIds } from '../api-utils.js'
import { buildPushPayload, notifyUserByName } from '../notifications.js'
import { normalizePersonName } from '../people.js'
import { listUsersWithScheduleManageStatement } from '../statements.js'

export const WEEK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const getScheduleManagerIds = async (excludeUserId = null) =>
  listUserIds(listUsersWithScheduleManageStatement, excludeUserId)

export const addDaysToDateKey = (dateKey, amount) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export const isShiftEnded = (shift) =>
  new Date(`${shift.date}T${shift.end_time}`) <= new Date()

export const parseWeekDeletePath = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/week\/(\d{4}-\d{2}-\d{2})$/)
  return match ? match[1] : null
}

export const notifyShiftDeleted = async ({
  shift,
  actorUser,
  tagId,
  title = 'Смена удалена',
}) => {
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
      title,
      body: formatShiftLabel(shift),
      url: '/schedule',
      tag: `shift-deleted-${tagId}`,
      urgency: 'high',
    }),
  )
}
