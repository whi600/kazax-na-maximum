import { db } from '../db.js'

export const upsertEditingPresenceStatement = db.prepare(`
  INSERT INTO editing_presence(resource, user_id, user_name, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(resource, user_id)
  DO UPDATE SET
    user_name = excluded.user_name,
    updated_at = datetime('now')
`)

export const removeEditingPresenceStatement = db.prepare(
  'DELETE FROM editing_presence WHERE resource = ? AND user_id = ?',
)

export const listEditingPresenceStatement = db.prepare(`
  SELECT resource, user_id, user_name, updated_at
  FROM editing_presence
  WHERE resource = ?
    AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '35 seconds'
  ORDER BY updated_at DESC
`)

export const upsertResourceStateStatement = db.prepare(`
  INSERT INTO resource_state(resource, last_changed_at, last_changed_by)
  VALUES (?, datetime('now'), ?)
  ON CONFLICT(resource)
  DO UPDATE SET
    last_changed_at = datetime('now'),
    last_changed_by = excluded.last_changed_by
`)

export const getResourceStateStatement = db.prepare(
  'SELECT resource, last_changed_at, last_changed_by FROM resource_state WHERE resource = ?',
)

export const insertAuditLogStatement = db.prepare(`
  INSERT INTO audit_log(
    actor_user_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    before_json,
    after_json,
    context_json,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, datetime('now'))
`)

export const listAuditLogStatement = db.prepare(`
  SELECT
    id,
    actor_user_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    before_json,
    after_json,
    context_json,
    created_at
  FROM audit_log
  ORDER BY created_at DESC, id DESC
  LIMIT ?
  OFFSET ?
`)
