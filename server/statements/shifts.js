import { db } from '../db.js'

export const listUpcomingShiftsStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    status
  FROM shifts
  WHERE date >= ?
  ORDER BY date ASC, start_time ASC
`)

export const listAllShiftsStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    status
  FROM shifts
  ORDER BY date DESC, start_time DESC
`)

export const listReminderShiftsStatement = db.prepare(`
  SELECT id, date, start_time, end_time, employee_name
  FROM shifts
  WHERE status = 'approved'
    AND employee_name IS NOT NULL
    AND date >= ?
  ORDER BY date ASC, start_time ASC
`)

export const getShiftByIdStatement = db.prepare(
  'SELECT id, date, start_time, end_time, employee_name, status, created_by FROM shifts WHERE id = ?',
)

export const insertShiftStatement = db.prepare(`
  INSERT INTO shifts(date, start_time, end_time, employee_name, status, created_by, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  RETURNING id
`)

export const updateShiftEmployeeStatement = db.prepare(
  "UPDATE shifts SET employee_name = ?, updated_at = datetime('now') WHERE id = ?",
)

export const updateShiftStatusStatement = db.prepare(
  "UPDATE shifts SET status = ?, updated_at = datetime('now') WHERE id = ?",
)

export const updateShiftDetailsStatement = db.prepare(
  "UPDATE shifts SET date = ?, start_time = ?, end_time = ?, updated_at = datetime('now') WHERE id = ?",
)

export const deleteShiftStatement = db.prepare('DELETE FROM shifts WHERE id = ?')
