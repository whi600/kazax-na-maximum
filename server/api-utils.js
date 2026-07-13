import { buildPushPayload, notifyUsers } from './notifications.js'
import {
  getCurrentWeekStartDate,
  getRetentionStartDate,
  getToday,
} from './date-utils.js'

export { getCurrentWeekStartDate, getRetentionStartDate, getToday }

export const toShiftDto = (row) => ({
  id: row.id,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
  employee_name: row.employee_name,
  employee_user_id: row.employee_user_id ?? null,
  status: row.status || 'approved',
})

export const isValidShiftRange = (startTime, endTime) =>
  Boolean(startTime && endTime && startTime < endTime)

export const parseShiftId = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/(\d+)(?:\/([a-z-]+))?$/)
  if (!match) return null
  return {
    id: Number(match[1]),
    action: match[2] || null,
  }
}

export const parseProductId = (pathname) => {
  const match = pathname.match(/^\/api\/products\/(\d+)$/)
  if (!match) return null
  return Number(match[1])
}

export const parseUserId = (pathname) => {
  const match = pathname.match(/^\/api\/users\/(\d+)\/role$/)
  if (!match) return null
  return Number(match[1])
}

export const parseInteger = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

export const formatShiftLabel = (shift) =>
  `${shift.date} ${shift.start_time}-${shift.end_time}`

export const normalizeProductCategory = (value) => {
  const category = String(value || '').trim().toLowerCase()
  if (category === 'bakery' || category === 'pastry' || category === 'other') {
    return category
  }
  return 'other'
}

export const listUserIds = async (statement, excludeUserId = null) =>
  (await statement.all())
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id !== Number(excludeUserId))

export const notifyNewFreeShifts = async ({ shifts, actorUser, listEmployeeUsersStatement }) => {
  if (!shifts.length) return

  const recipients = await listUserIds(listEmployeeUsersStatement, actorUser?.id)
  if (recipients.length === 0) return

  const firstShift = shifts[0]
  await notifyUsers(
    recipients,
    'shifts',
    buildPushPayload({
      title: shifts.length === 1 ? 'Новая свободная смена' : 'Новые свободные смены',
      body:
        shifts.length === 1
          ? formatShiftLabel(firstShift)
          : `Добавлено смен: ${shifts.length}. Ближайшая: ${formatShiftLabel(firstShift)}`,
      url: '/schedule',
      tag:
        shifts.length === 1
          ? `shift-created-${firstShift.id}`
          : `shifts-created-${firstShift.date}-${shifts.length}`,
      urgency: 'high',
    }),
  )
}
