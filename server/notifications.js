import { toBoolInt } from './auth.js'
import { pushConfig, sendPushNotification } from './push.js'
import {
  disablePushSubscriptionStatement,
  getNotificationMarkStatement,
  getNotificationSettingsStatement,
  getUserByNameStatement,
  insertNotificationMarkStatement,
  listPushSubscriptionsByUserIdsStatement,
  listReminderShiftsStatement,
  markPushSubscriptionErrorStatement,
  markPushSubscriptionSuccessStatement,
  upsertNotificationSettingsStatement,
} from './statements.js'

const REMINDER_WINDOWS = [
  { key: '12h', ms: 12 * 60 * 60 * 1000, label: 'через 12 часов' },
  { key: '2h', ms: 2 * 60 * 60 * 1000, label: 'через 2 часа' },
]
const REMINDER_LOOKBACK_MS = 15 * 60 * 1000

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
  for (const row of rows) {
    const result = await sendPushNotification(row, payload)
    if (result.ok) {
      await markPushSubscriptionSuccessStatement.run(row.endpoint)
      continue
    }

    if (result.statusCode === 404 || result.statusCode === 410) {
      await disablePushSubscriptionStatement.run(row.endpoint)
      continue
    }

    await markPushSubscriptionErrorStatement.run(row.endpoint)
  }
}

export const notifyUsers = async (userIds, kind, payload) => {
  const rows = await filterSubscriptionsBySettings(userIds, kind)
  await deliverPushRows(rows, payload)
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

let reminderTimer = null

export const startReminderLoop = () => {
  if (reminderTimer) clearInterval(reminderTimer)

  const run = () => {
    processShiftReminders().catch((error) => {
      console.error('Push reminder error', error)
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
