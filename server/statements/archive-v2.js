import { db } from '../db.js'

const shiftHoursSql = `
  GREATEST(
    EXTRACT(EPOCH FROM (end_time::time - start_time::time)) / 3600.0,
    0
  )
`

export const listArchiveCalendarDaysStatement = db.prepare(`
  WITH day_events AS (
    SELECT record_date AS date, 1 AS reports, 0 AS shifts, 0 AS assigned, 0 AS changes
    FROM daily_records
    WHERE record_date >= ? AND record_date <= ?
    GROUP BY record_date

    UNION ALL

    SELECT record_date AS date, 1 AS reports, 0 AS shifts, 0 AS assigned, 0 AS changes
    FROM daily_report_status
    WHERE record_date >= ? AND record_date <= ?

    UNION ALL

    SELECT
      date,
      0 AS reports,
      COUNT(*)::int AS shifts,
      COUNT(*) FILTER (WHERE employee_name IS NOT NULL)::int AS assigned,
      0 AS changes
    FROM shifts
    WHERE date >= ? AND date <= ? AND deleted_at IS NULL
    GROUP BY date

    UNION ALL

    SELECT
      TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
      0 AS reports,
      0 AS shifts,
      0 AS assigned,
      COUNT(*)::int AS changes
    FROM audit_log
    WHERE created_at >= ?::date
      AND created_at < (?::date + INTERVAL '1 day')
    GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')

    UNION ALL

    SELECT event_date AS date, 0 AS reports, 0 AS shifts, 0 AS assigned, 0 AS changes
    FROM calendar_events
    WHERE event_date >= ? AND event_date <= ? AND deleted_at IS NULL
    GROUP BY event_date
  )
  SELECT
    date,
    SUM(reports)::int AS reports_count,
    SUM(shifts)::int AS shifts_count,
    SUM(assigned)::int AS assigned_count,
    SUM(changes)::int AS changes_count
  FROM day_events
  GROUP BY date
  ORDER BY date ASC
`)

export const listArchiveDayRecordsStatement = db.prepare(`
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    COALESCE(p.name, dr.product_name, 'Удален') AS product_name,
    COALESCE(p.category, dr.product_category, 'other') AS product_category,
    COALESCE(p.unit, dr.product_unit, 'шт') AS product_unit
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date = ?
  ORDER BY product_category ASC, product_name ASC
`)

export const listArchiveDayShiftsStatement = db.prepare(`
  SELECT id, date, start_time, end_time, employee_name, employee_user_id, status
  FROM shifts
  WHERE date = ? AND deleted_at IS NULL
  ORDER BY start_time ASC, end_time ASC, id ASC
`)

export const listArchiveDayAuditStatement = db.prepare(`
  SELECT id, actor_user_id, actor_name, entity_type, entity_id, action,
         before_json, after_json, context_json, created_at
  FROM audit_log
  WHERE created_at >= ?::date
    AND created_at < (?::date + INTERVAL '1 day')
  ORDER BY created_at DESC, id DESC
  LIMIT 50
`)

export const listArchiveEmployeesStatement = db.prepare(`
  WITH shift_stats AS (
    SELECT
      employee_user_id,
      LOWER(TRIM(employee_name)) AS normalized_name,
      MAX(employee_name) AS snapshot_name,
      COUNT(*)::int AS shifts_count,
      COALESCE(SUM(${shiftHoursSql}), 0)::float AS hours,
      MIN(date) AS first_shift_date,
      MAX(date) AS last_shift_date
    FROM shifts
    WHERE deleted_at IS NULL
      AND status = 'approved'
      AND employee_name IS NOT NULL
    GROUP BY employee_user_id, LOWER(TRIM(employee_name))
  ),
  unique_user_names AS (
    SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS user_id
    FROM users
    WHERE NULLIF(TRIM(name), '') IS NOT NULL
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) = 1
  ),
  user_stats AS (
    SELECT
      'user:' || u.id AS employee_key,
      u.id AS user_id,
      u.name,
      u.role,
      COALESCE(SUM(ss.shifts_count), 0)::int AS shifts_count,
      COALESCE(SUM(ss.hours), 0)::float AS hours,
      MIN(ss.first_shift_date) AS first_shift_date,
      MAX(ss.last_shift_date) AS last_shift_date,
      (SELECT COUNT(*)::int FROM shift_unbook_requests r WHERE r.requester_user_id = u.id)
        AS requests_count
    FROM users u
    LEFT JOIN shift_stats ss
      ON ss.employee_user_id = u.id
      OR (
        ss.employee_user_id IS NULL
        AND ss.normalized_name = LOWER(TRIM(u.name))
        AND EXISTS (
          SELECT 1 FROM unique_user_names names
          WHERE names.normalized_name = ss.normalized_name AND names.user_id = u.id
        )
      )
    GROUP BY u.id, u.name, u.role
  ),
  legacy_stats AS (
    SELECT
      'legacy:' || normalized_name AS employee_key,
      NULL::int AS user_id,
      MAX(snapshot_name) AS name,
      'archive'::text AS role,
      SUM(shifts_count)::int AS shifts_count,
      SUM(hours)::float AS hours,
      MIN(first_shift_date) AS first_shift_date,
      MAX(last_shift_date) AS last_shift_date,
      0::int AS requests_count
    FROM shift_stats
    WHERE employee_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM unique_user_names names
        WHERE names.normalized_name = shift_stats.normalized_name
      )
    GROUP BY normalized_name
  ),
  directory AS (
    SELECT * FROM user_stats
    UNION ALL
    SELECT * FROM legacy_stats
  )
  SELECT *, COUNT(*) OVER()::int AS total_count
  FROM directory
  WHERE LOWER(name) LIKE LOWER(?)
  ORDER BY LOWER(name) ASC, employee_key ASC
  LIMIT ? OFFSET ?
`)

export const listArchiveEmployeeShiftsStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    employee_user_id,
    status,
    ${shiftHoursSql}::float AS hours,
    COUNT(*) OVER()::int AS total_count,
    SUM(${shiftHoursSql}) OVER()::float AS total_hours
  FROM shifts
  WHERE deleted_at IS NULL
    AND status = 'approved'
    AND employee_name IS NOT NULL
    AND (
      employee_user_id = ?
      OR (?::int IS NULL AND employee_user_id IS NULL AND LOWER(TRIM(employee_name)) = ?)
    )
  ORDER BY date DESC, start_time DESC, id DESC
  LIMIT ? OFFSET ?
`)

export const listArchiveEmployeeRequestsStatement = db.prepare(`
  WITH requests AS (
    SELECT
      'unbook'::text AS type,
      r.id,
      s.date,
      s.start_time,
      s.end_time,
      r.status,
      r.created_at
    FROM shift_unbook_requests r
    JOIN shifts s ON s.id = r.shift_id
    WHERE r.requester_user_id = ?
      OR (?::int IS NULL AND LOWER(TRIM(r.requester_name)) = ?)

    UNION ALL

    SELECT
      'help'::text AS type,
      s.id,
      s.date,
      s.start_time,
      s.end_time,
      s.status,
      s.created_at
    FROM shifts s
    WHERE s.created_by = ?
      AND s.employee_name IS NOT NULL
  )
  SELECT *, COUNT(*) OVER()::int AS total_count
  FROM requests
  ORDER BY created_at DESC, id DESC
  LIMIT 10
`)

export const listArchivePeriodEmployeesStatement = db.prepare(`
  SELECT
    COALESCE('user:' || employee_user_id, 'legacy:' || LOWER(TRIM(employee_name)))
      AS employee_key,
    MAX(employee_user_id) AS user_id,
    MAX(employee_name) AS name,
    COUNT(*)::int AS shifts_count,
    COALESCE(SUM(${shiftHoursSql}), 0)::float AS hours
  FROM shifts
  WHERE deleted_at IS NULL
    AND status = 'approved'
    AND employee_name IS NOT NULL
    AND date >= ? AND date <= ?
  GROUP BY COALESCE('user:' || employee_user_id, 'legacy:' || LOWER(TRIM(employee_name)))
  ORDER BY LOWER(MAX(employee_name)) ASC
`)

export const listArchivePeriodProductsStatement = db.prepare(`
  SELECT
    dr.product_id,
    COALESCE(p.name, dr.product_name, 'Удален') AS product_name,
    COALESCE(p.category, dr.product_category, 'other') AS product_category,
    COALESCE(p.unit, dr.product_unit, 'шт') AS product_unit,
    COALESCE(SUM(dr.arrival), 0)::float AS arrival,
    COALESCE(SUM(dr.write_off), 0)::float AS write_off,
    COALESCE((ARRAY_AGG(dr.remainder ORDER BY dr.record_date DESC))[1], 0)::float
      AS latest_remainder
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date >= ? AND dr.record_date <= ?
  GROUP BY
    dr.product_id,
    COALESCE(p.name, dr.product_name, 'Удален'),
    COALESCE(p.category, dr.product_category, 'other'),
    COALESCE(p.unit, dr.product_unit, 'шт')
  ORDER BY product_category ASC, product_name ASC
`)
