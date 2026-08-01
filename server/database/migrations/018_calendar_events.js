export const calendarEventsMigration = {
  name: '018_calendar_events',
  sql: `
    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      event_date TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT,
      end_time TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_date
      ON calendar_events(event_date)
      WHERE deleted_at IS NULL;
  `,
}
