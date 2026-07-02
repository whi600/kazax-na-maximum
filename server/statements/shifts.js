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
    AND deleted_at IS NULL
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
  WHERE deleted_at IS NULL
  ORDER BY date DESC, start_time DESC
`)

export const listArchiveShiftsPageStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    status
  FROM shifts
  WHERE deleted_at IS NULL
  ORDER BY date DESC, start_time DESC, id DESC
  LIMIT ?
  OFFSET ?
`)

export const countArchiveShiftsStatement = db.prepare(`
  SELECT COUNT(*)::int AS count
  FROM shifts
  WHERE deleted_at IS NULL
`)

export const listArchiveShiftEmployeeCountsStatement = db.prepare(`
  SELECT
    employee_name,
    COUNT(*)::int AS count
  FROM shifts
  WHERE deleted_at IS NULL
    AND status = 'approved'
    AND employee_name IS NOT NULL
  GROUP BY employee_name
  ORDER BY LOWER(employee_name) ASC
`)

export const listReminderShiftsStatement = db.prepare(`
  SELECT id, date, start_time, end_time, employee_name
  FROM shifts
  WHERE status = 'approved'
    AND employee_name IS NOT NULL
    AND date >= ?
    AND deleted_at IS NULL
  ORDER BY date ASC, start_time ASC
`)

export const listReportReminderShiftsStatement = db.prepare(`
  SELECT id, date, start_time, end_time, employee_name
  FROM shifts
  WHERE status = 'approved'
    AND date >= ?
    AND deleted_at IS NULL
  ORDER BY date ASC, end_time ASC, start_time ASC
`)

export const listEmployeeProfileShiftsStatement = db.prepare(`
  SELECT id, date, start_time, end_time, employee_name, status
  FROM shifts
  WHERE deleted_at IS NULL
    AND status = 'approved'
    AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
  ORDER BY date DESC, start_time DESC, id DESC
  LIMIT ?
`)

export const getShiftByIdStatement = db.prepare(
  'SELECT id, date, start_time, end_time, employee_name, status, created_by FROM shifts WHERE id = ? AND deleted_at IS NULL',
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

export const deleteShiftStatement = db.prepare(
  "UPDATE shifts SET deleted_at = datetime('now'), deleted_by = ?, delete_reason = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
)

export const getApprovedShiftForUserDateStatement = db.prepare(`
  SELECT id
  FROM shifts
  WHERE date = ?
    AND status = 'approved'
    AND deleted_at IS NULL
    AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
  LIMIT 1
`)

export const createShiftUnbookRequestStatement = db.prepare(`
  INSERT INTO shift_unbook_requests(
    shift_id,
    requester_user_id,
    requester_name,
    status,
    updated_at
  )
  VALUES (?, ?, ?, 'pending', datetime('now'))
  ON CONFLICT(shift_id, requester_user_id)
  WHERE status = 'pending'
  DO UPDATE SET
    requester_name = excluded.requester_name,
    updated_at = datetime('now')
  RETURNING id
`)

export const getPendingShiftUnbookRequestStatement = db.prepare(`
  SELECT
    sur.id,
    sur.shift_id,
    sur.requester_user_id,
    sur.requester_name,
    sur.status,
    sur.created_at,
    s.date,
    s.start_time,
    s.end_time,
    s.employee_name
  FROM shift_unbook_requests sur
  JOIN shifts s ON s.id = sur.shift_id
  WHERE sur.id = ?
    AND sur.status = 'pending'
    AND s.deleted_at IS NULL
  LIMIT 1
`)

export const listPendingShiftUnbookRequestsStatement = db.prepare(`
  SELECT
    sur.id,
    sur.shift_id,
    sur.requester_user_id,
    sur.requester_name,
    sur.status,
    sur.created_at,
    s.date,
    s.start_time,
    s.end_time,
    s.employee_name
  FROM shift_unbook_requests sur
  JOIN shifts s ON s.id = sur.shift_id
  WHERE sur.status = 'pending'
    AND s.date >= ?
    AND s.deleted_at IS NULL
    AND LOWER(TRIM(s.employee_name)) = LOWER(TRIM(sur.requester_name))
  ORDER BY s.date ASC, s.start_time ASC, sur.created_at ASC
`)

export const listUserPendingShiftUnbookRequestsStatement = db.prepare(`
  SELECT
    sur.id,
    sur.shift_id,
    sur.requester_user_id,
    sur.requester_name,
    sur.status,
    sur.created_at
  FROM shift_unbook_requests sur
  JOIN shifts s ON s.id = sur.shift_id
  WHERE sur.status = 'pending'
    AND sur.requester_user_id = ?
    AND s.date >= ?
    AND s.deleted_at IS NULL
    AND LOWER(TRIM(s.employee_name)) = LOWER(TRIM(sur.requester_name))
`)

export const updateShiftUnbookRequestStatusStatement = db.prepare(`
  UPDATE shift_unbook_requests
  SET status = ?, decided_by = ?, decided_at = datetime('now'), updated_at = datetime('now')
  WHERE id = ? AND status = 'pending'
`)
