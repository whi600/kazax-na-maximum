export const resourceRevisionsMigration = {
  name: '016_resource_revisions',
  sql: `
    ALTER TABLE resource_state
      ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS operation_results (
      operation_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_operation_results_user_created
      ON operation_results(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operation_results_created
      ON operation_results(created_at);
  `,
}
