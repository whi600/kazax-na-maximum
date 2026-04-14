import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const defaultDbPath = path.resolve(process.cwd(), 'data', 'kofeteriy.sqlite')
const dbPath = process.env.DB_PATH || defaultDbPath

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)

// Basic SQLite tuning for small multi-request app.
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const migrations = [
  {
    name: '001_users_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
  {
    name: '002_products_daily_records',
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        unit TEXT NOT NULL DEFAULT 'шт',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        arrival REAL NOT NULL DEFAULT 0,
        remainder REAL NOT NULL DEFAULT 0,
        write_off REAL NOT NULL DEFAULT 0,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(record_date, product_id)
      );

      CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(record_date);
      CREATE INDEX IF NOT EXISTS idx_daily_records_product ON daily_records(product_id);
    `,
  },
  {
    name: '003_shifts',
    sql: `
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        employee_name TEXT,
        status TEXT NOT NULL DEFAULT 'approved',
        is_paid INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
      CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    `,
  },
]

const appliedMigrationRows = db.prepare('SELECT name FROM migrations').all()
const appliedMigrations = new Set(appliedMigrationRows.map((row) => row.name))

for (const migration of migrations) {
  if (appliedMigrations.has(migration.name)) continue

  db.exec('BEGIN')
  try {
    db.exec(migration.sql)
    db.prepare('INSERT INTO migrations(name) VALUES (?)').run(migration.name)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const defaultProducts = [
  { name: 'Хлеб белый', category: 'bakery', unit: 'шт' },
  { name: 'Багет', category: 'bakery', unit: 'шт' },
  { name: 'Круассан', category: 'pastry', unit: 'шт' },
  { name: 'Эклер', category: 'pastry', unit: 'шт' },
  { name: 'Чизкейк порция', category: 'pastry', unit: 'порц' },
  { name: 'Слойка с ветчиной', category: 'bakery', unit: 'шт' },
]

const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count
if (productsCount === 0) {
  const insertProduct = db.prepare(
    'INSERT INTO products(name, category, unit) VALUES (?, ?, ?)',
  )
  db.exec('BEGIN')
  try {
    for (const product of defaultProducts) {
      insertProduct.run(product.name, product.category, product.unit)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export { db, dbPath }
