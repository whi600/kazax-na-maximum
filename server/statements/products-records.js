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
