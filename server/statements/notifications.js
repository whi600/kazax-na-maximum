import { db } from '../db.js'

export const getNotificationSettingsStatement = db.prepare(`
  SELECT
    user_id,
    push_enabled,
    shifts_enabled,
    reminders_enabled,
    updated_at
  FROM notification_settings
  WHERE user_id = ?
`)

export const upsertNotificationSettingsStatement = db.prepare(`
  INSERT INTO notification_settings(
    user_id,
    push_enabled,
    shifts_enabled,
    reminders_enabled,
    updated_at
  )
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id)
  DO UPDATE SET
    push_enabled = excluded.push_enabled,
    shifts_enabled = excluded.shifts_enabled,
    reminders_enabled = excluded.reminders_enabled,
    updated_at = datetime('now')
`)

export const upsertPushSubscriptionStatement = db.prepare(`
  INSERT INTO push_subscriptions(
    user_id,
    endpoint,
    p256dh_key,
    auth_key,
    user_agent,
    updated_at,
    disabled_at,
    last_error_at
  )
  VALUES (?, ?, ?, ?, ?, datetime('now'), NULL, NULL)
  ON CONFLICT(endpoint)
  DO UPDATE SET
    user_id = excluded.user_id,
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    updated_at = datetime('now'),
    disabled_at = NULL,
    last_error_at = NULL
`)

export const deletePushSubscriptionStatement = db.prepare(
  'DELETE FROM push_subscriptions WHERE endpoint = ?',
)

export const listPushSubscriptionsByUserIdsStatement = db.prepare(`
  SELECT
    ps.id,
    ps.user_id,
    ps.endpoint,
    ps.p256dh_key,
    ps.auth_key,
    ps.user_agent,
    ps.created_at,
    ps.updated_at,
    ps.last_success_at,
    ps.last_error_at,
    ps.disabled_at
  FROM push_subscriptions ps
  WHERE ps.user_id = ANY(?::int[])
    AND ps.disabled_at IS NULL
`)

export const markPushSubscriptionSuccessStatement = db.prepare(
  "UPDATE push_subscriptions SET last_success_at = datetime('now'), last_error_at = NULL, updated_at = datetime('now') WHERE endpoint = ?",
)

export const markPushSubscriptionErrorStatement = db.prepare(
  "UPDATE push_subscriptions SET last_error_at = datetime('now'), updated_at = datetime('now') WHERE endpoint = ?",
)

export const disablePushSubscriptionStatement = db.prepare(
  "UPDATE push_subscriptions SET disabled_at = datetime('now'), last_error_at = datetime('now'), updated_at = datetime('now') WHERE endpoint = ?",
)

export const getNotificationMarkStatement = db.prepare(
  'SELECT dedupe_key, user_id, kind, created_at FROM notification_marks WHERE dedupe_key = ?',
)

export const insertNotificationMarkStatement = db.prepare(
  'INSERT INTO notification_marks(dedupe_key, user_id, kind) VALUES (?, ?, ?)',
)
