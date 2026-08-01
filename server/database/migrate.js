import { legacyMigrations } from './migrations/001-015.js'
import { resourceRevisionsMigration } from './migrations/016_resource_revisions.js'
import { shiftEmployeeIdentityMigration } from './migrations/017_shift_employee_identity.js'
import { calendarEventsMigration } from './migrations/018_calendar_events.js'

const migrations = [
  ...legacyMigrations,
  resourceRevisionsMigration,
  shiftEmployeeIdentityMigration,
  calendarEventsMigration,
]

export const runMigrations = async (database, migrationList = migrations) => {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const rows = await database.prepare('SELECT name FROM migrations').all()
  const applied = new Set(rows.map((row) => row.name))

  for (const migration of migrationList) {
    if (applied.has(migration.name)) continue

    await database.transaction(async (client) => {
      await client.query(migration.sql)
      await client.query('INSERT INTO migrations(name) VALUES ($1)', [migration.name])
    })
  }
}
