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
    p.name,
    p.category,
    p.unit
  FROM daily_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date = ?
  ORDER BY p.name
`)

export const deleteTodayRecordsStatement = db.prepare(
  'DELETE FROM daily_records WHERE record_date = ?',
)

export const deleteArchiveRecordsBeforeStatement = db.prepare(
  'DELETE FROM daily_records WHERE record_date < ?',
)

export const insertDailyRecordStatement = db.prepare(`
  INSERT INTO daily_records(record_date, product_id, arrival, remainder, write_off, user_id, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`)

export const listArchiveRecordsStatement = db.prepare(`
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    p.name AS product_name,
    p.category AS product_category
  FROM daily_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date >= ?
  ORDER BY dr.record_date DESC, p.name ASC
`)
