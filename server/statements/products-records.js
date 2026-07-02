import { db } from '../db.js'

export const listProductsStatement = db.prepare(
  'SELECT id, name, category, unit FROM products ORDER BY name',
)

export const getProductByIdStatement = db.prepare(
  'SELECT id, name, category, unit FROM products WHERE id = ?',
)

export const insertProductStatement = db.prepare(
  "INSERT INTO products(name, category, unit) VALUES (?, ?, ?) RETURNING id",
)

export const updateProductStatement = db.prepare(
  "UPDATE products SET name = ?, category = ?, unit = ? WHERE id = ?",
)

export const deleteProductStatement = db.prepare('DELETE FROM products WHERE id = ?')

export const listTodayRecordsStatement = db.prepare(`
  SELECT
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    COALESCE(p.name, dr.product_name, 'Удален') AS name,
    COALESCE(p.category, dr.product_category, 'other') AS category,
    COALESCE(p.unit, dr.product_unit, 'шт') AS unit
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date = ?
    AND dr.product_id IS NOT NULL
  ORDER BY name
`)

export const deleteTodayRecordsStatement = db.prepare(
  'DELETE FROM daily_records WHERE record_date = ? AND product_id IS NOT NULL',
)

export const insertDailyRecordStatement = db.prepare(`
  INSERT INTO daily_records(
    record_date,
    product_id,
    product_name,
    product_category,
    product_unit,
    arrival,
    remainder,
    write_off,
    user_id,
    updated_at
  )
  SELECT ?, p.id, p.name, p.category, p.unit, ?, ?, ?, ?, datetime('now')
  FROM products p
  WHERE p.id = ?
`)

export const listArchiveRecordsStatement = db.prepare(`
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    COALESCE(p.name, dr.product_name, 'Удален') AS product_name,
    COALESCE(p.category, dr.product_category, 'other') AS product_category
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date >= ?
  ORDER BY dr.record_date DESC, product_name ASC
`)

export const listArchiveRecordsPageStatement = db.prepare(`
  WITH selected_dates AS (
    SELECT DISTINCT record_date
    FROM daily_records
    WHERE record_date >= ?
    ORDER BY record_date DESC
    LIMIT ?
    OFFSET ?
  )
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    COALESCE(p.name, dr.product_name, 'Удален') AS product_name,
    COALESCE(p.category, dr.product_category, 'other') AS product_category
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  JOIN selected_dates sd ON sd.record_date = dr.record_date
  ORDER BY dr.record_date DESC, product_name ASC
`)

export const countArchiveRecordDaysStatement = db.prepare(`
  SELECT COUNT(DISTINCT record_date)::int AS count
  FROM daily_records
  WHERE record_date >= ?
`)

export const getDailyReportStatusStatement = db.prepare(`
  SELECT
    drs.record_date,
    drs.completed_at,
    drs.completed_by_user_id,
    u.name AS completed_by_name
  FROM daily_report_status drs
  LEFT JOIN users u ON u.id = drs.completed_by_user_id
  WHERE drs.record_date = ?
`)

export const upsertDailyReportStatusStatement = db.prepare(`
  INSERT INTO daily_report_status(record_date, completed_by_user_id, completed_at, updated_at)
  VALUES (?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(record_date)
  DO UPDATE SET
    completed_by_user_id = excluded.completed_by_user_id,
    completed_at = datetime('now'),
    updated_at = datetime('now')
`)

export const deleteDailyReportStatusStatement = db.prepare(
  'DELETE FROM daily_report_status WHERE record_date = ?',
)

export const listWriteOffTotalsPageStatement = db.prepare(`
  WITH selected_dates AS (
    SELECT DISTINCT record_date
    FROM daily_records
    ORDER BY record_date DESC
    LIMIT ?
    OFFSET ?
  )
  SELECT
    sd.record_date,
    COALESCE(SUM(CASE WHEN dr.write_off > 0 THEN dr.write_off ELSE 0 END), 0)::float AS total_write_off,
    COUNT(*) FILTER (WHERE dr.write_off > 0)::int AS items_count
  FROM selected_dates sd
  LEFT JOIN daily_records dr ON dr.record_date = sd.record_date
  GROUP BY sd.record_date
  ORDER BY sd.record_date DESC
`)

export const countWriteOffDaysStatement = db.prepare(`
  SELECT COUNT(DISTINCT record_date)::int AS count
  FROM daily_records
`)

export const listWriteOffDetailsByDateStatement = db.prepare(`
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.write_off,
    COALESCE(p.name, dr.product_name, 'Удален') AS product_name,
    COALESCE(p.category, dr.product_category, 'other') AS product_category,
    COALESCE(p.unit, dr.product_unit, 'шт') AS product_unit
  FROM daily_records dr
  LEFT JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date = ?
    AND dr.write_off > 0
  ORDER BY product_category ASC, product_name ASC
`)
