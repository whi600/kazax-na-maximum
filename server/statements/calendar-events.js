import { db } from '../db.js'

export const listCalendarEventsRangeStatement = db.prepare(`
  SELECT id, event_date, title, description, start_time, end_time,
         created_by, created_at, updated_at
  FROM calendar_events
  WHERE event_date >= ? AND event_date <= ? AND deleted_at IS NULL
  ORDER BY event_date ASC, start_time ASC NULLS FIRST, id ASC
`)

export const listCalendarEventsDayStatement = db.prepare(`
  SELECT id, event_date, title, description, start_time, end_time,
         created_by, created_at, updated_at
  FROM calendar_events
  WHERE event_date = ? AND deleted_at IS NULL
  ORDER BY start_time ASC NULLS FIRST, id ASC
`)

export const getCalendarEventByIdStatement = db.prepare(`
  SELECT id, event_date, title, description, start_time, end_time,
         created_by, created_at, updated_at
  FROM calendar_events
  WHERE id = ? AND deleted_at IS NULL
`)

export const insertCalendarEventStatement = db.prepare(`
  INSERT INTO calendar_events(
    event_date, title, description, start_time, end_time, created_by, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  RETURNING id
`)

export const updateCalendarEventStatement = db.prepare(`
  UPDATE calendar_events
  SET event_date = ?, title = ?, description = ?, start_time = ?, end_time = ?,
      updated_at = datetime('now')
  WHERE id = ? AND deleted_at IS NULL
`)

export const deleteCalendarEventStatement = db.prepare(`
  UPDATE calendar_events
  SET deleted_at = datetime('now'), updated_at = datetime('now')
  WHERE id = ? AND deleted_at IS NULL
`)
