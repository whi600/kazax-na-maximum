import { toBoolInt } from './auth.js'
import { pushConfig, sendPushNotification } from './push.js'
import {
  disablePushSubscriptionStatement,
  getDailyReportStatusStatement,
  getNotificationMarkStatement,
  getNotificationSettingsStatement,
  getUserByNameStatement,
  insertNotificationMarkStatement,
  listAdminUsersStatement,
  listPushSubscriptionsByUserIdsStatement,
  listReminderShiftsStatement,
  listReportReminderShiftsStatement,
  markPushSubscriptionErrorStatement,
  markPushSubscriptionSuccessStatement,
  upsertNotificationSettingsStatement,
} from './statements.js'

const REMINDER_WINDOWS = [
  { key: '12h', ms: 12 * 60 * 60 * 1000, label: 'через 12 часов' },
  { key: '2h', ms: 2 * 60 * 60 * 1000, label: 'через 2 часа' },
]
const REMINDER_LOOKBACK_MS = 15 * 60 * 1000
const REPORT_REMINDER_BEFORE_END_MS = 30 * 60 * 1000

const getToday = () => new Date().toISOString().slice(0, 10)

export const mapNotificationSettings = (row) => ({
  push_enabled: toBoolInt(row?.push_enabled, 1) === 1,
  shifts_enabled: toBoolInt(row?.shifts_enabled, 1) === 1,
  reminders_enabled: toBoolInt(row?.reminders_enabled, 1) === 1,
  updated_at: row?.updated_at || null,
})

export const ensureNotificationSettings = async (userId) => {
  let row = await getNotificationSettingsStatement.get(userId)
  if (!row) {
    await upsertNotificationSettingsStatement.run(userId, 1, 1, 1)
    row = await getNotificationSettingsStatement.get(userId)
  }
  return mapNotificationSettings(row)
}

export const buildPushPayload = ({
  title,
  body,
  url,
  tag,
  urgency = 'normal',
}) => ({
  title,
  body,
  url,
  tag,
  urgency,
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
})

const parseShiftStart = (date, startTime) => new Date(`${date}T${startTime}:00`)

const parseShiftEnd = (shift) => {
  const start = new Date(`${shift.date}T${shift.start_time}:00`)
  const end = new Date(`${shift.date}T${shift.end_time}:00`)
  if (end <= start) end.setDate(end.getDate() + 1)
  return end
}

const filterSubscriptionsBySettings = async (userIds, kind) => {
  const uniqueIds = [...new Set((userIds || []).map((id) => Number(id)).filter(Number.isFinite))]
  if (uniqueIds.length === 0) return []

  const rows = await listPushSubscriptionsByUserIdsStatement.all(uniqueIds)
  if (rows.length === 0) return []

  const column = kind === 'reminders' ? 'reminders_enabled' : 'shifts_enabled'

  const enabledUsers = new Set()
  for (const userId of uniqueIds) {
    const settings = await ensureNotificationSettings(userId)
    if (settings.push_enabled && settings[column]) enabledUsers.add(userId)
  }

  return rows.filter((row) => enabledUsers.has(Number(row.user_id)))
}

const deliverPushRows = async (rows, payload) => {
  let deliveredCount = 0
  for (const row of rows) {
    const result = await sendPushNotification(row, payload)
    if (result.ok) {
      await markPushSubscriptionSuccessStatement.run(row.endpoint)
      deliveredCount += 1
      continue
    }

    if (result.statusCode === 404 || result.statusCode === 410) {
      await disablePushSubscriptionStatement.run(row.endpoint)
      continue
    }

    await markPushSubscriptionErrorStatement.run(row.endpoint)
  }
  return deliveredCount
}

export const notifyUsers = async (userIds, kind, payload) => {
  const rows = await filterSubscriptionsBySettings(userIds, kind)
  return deliverPushRows(rows, payload)
}

export const notifyUserByName = async (name, kind, payload) => {
  const user = await getUserByNameStatement.get(name)
  if (!user) return
  await notifyUsers([user.id], kind, payload)
}

const markNotificationIfNeeded = async (dedupeKey, userId, kind) => {
  const existing = await getNotificationMarkStatement.get(dedupeKey)
  if (existing) return false
  await insertNotificationMarkStatement.run(dedupeKey, userId, kind)
  return true
}

const processShiftReminders = async () => {
  const rows = await listReminderShiftsStatement.all(getToday())
  const now = Date.now()

  for (const shift of rows) {
    const user = await getUserByNameStatement.get(shift.employee_name)
    if (!user) continue

    const shiftStart = parseShiftStart(shift.date, shift.start_time).getTime()
    if (!Number.isFinite(shiftStart) || shiftStart <= now) continue

    for (const window of REMINDER_WINDOWS) {
      const diff = shiftStart - now
      if (diff > window.ms || diff < window.ms - REMINDER_LOOKBACK_MS) continue

      const dedupeKey = `shift-reminder:${shift.id}:${window.key}:${user.id}`
      const shouldSend = await markNotificationIfNeeded(dedupeKey, user.id, 'shift_reminder')
      if (!shouldSend) continue

      await notifyUsers(
        [user.id],
        'reminders',
        buildPushPayload({
          title: 'Напоминание о смене',
          body: `${shift.date} ${shift.start_time}-${shift.end_time}, ${window.label}`,
          url: '/schedule',
          tag: `shift-reminder-${shift.id}-${window.key}`,
        }),
      )
    }
  }
}

const groupReportReminderCandidates = (rows) => {
  const byDate = new Map()

  for (const shift of rows) {
    if (!shift?.date || !shift?.start_time || !shift?.end_time) continue
    const end = parseShiftEnd(shift)
    if (Number.isNaN(end.getTime())) continue

    const current = byDate.get(shift.date)
    if (!current || end > current.end) {
      byDate.set(shift.date, { end, shifts: [shift] })
      continue
    }

    if (end.getTime() === current.end.getTime()) {
      current.shifts.push(shift)
    }
  }

  return byDate
}

const processReportReminders = async () => {
  const rows = await listReportReminderShiftsStatement.all(getToday())
  const grouped = groupReportReminderCandidates(rows)
  const now = Date.now()

  for (const [date, group] of grouped.entries()) {
    const diff = group.end.getTime() - now
    if (
      diff > REPORT_REMINDER_BEFORE_END_MS ||
      diff < REPORT_REMINDER_BEFORE_END_MS - REMINDER_LOOKBACK_MS
    ) {
      continue
    }

    const status = await getDailyReportStatusStatement.get(date)
    if (status?.completed_at) continue

    const recipientIds = new Set(
      (await listAdminUsersStatement.all()).map((row) => Number(row.id)),
    )

    for (const shift of group.shifts) {
      if (!shift.employee_name) continue
      const user = await getUserByNameStatement.get(shift.employee_name)
      if (user?.id) recipientIds.add(Number(user.id))
    }

    const usersToNotify = []
    for (const userId of recipientIds) {
      const dedupeKey = `daily-report-missing:${date}:${userId}`
      const shouldSend = await markNotificationIfNeeded(
        dedupeKey,
        userId,
        'daily_report_missing',
      )
      if (shouldSend) usersToNotify.push(userId)
    }

    if (usersToNotify.length === 0) continue

    await notifyUsers(
      usersToNotify,
      'reminders',
      buildPushPayload({
        title: 'Отчет не отмечен готовым',
        body: `До конца последней смены осталось 30 минут. Проверьте отчет за ${date}.`,
        url: '/report',
        tag: `daily-report-missing-${date}`,
        urgency: 'high',
      }),
    )
  }
}

let reminderTimer = null

export const startReminderLoop = () => {
  if (reminderTimer) clearInterval(reminderTimer)

  const run = () => {
    processShiftReminders().catch((error) => {
      console.error('Push reminder error', error)
    })
    processReportReminders().catch((error) => {
      console.error('Report reminder error', error)
    })
  }

  run()
  reminderTimer = setInterval(run, 60 * 1000)
}

export const stopReminderLoop = () => {
  if (!reminderTimer) return
  clearInterval(reminderTimer)
  reminderTimer = null
}

export { pushConfig }
