// Historical migrations are immutable. Add new schema changes as a new numbered module.
export const legacyMigrations = [
  {
    name: '001_users_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
  {
    name: '002_products_daily_records',
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        unit TEXT NOT NULL DEFAULT 'шт',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_records (
        id SERIAL PRIMARY KEY,
        record_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        arrival DOUBLE PRECISION NOT NULL DEFAULT 0,
        remainder DOUBLE PRECISION NOT NULL DEFAULT 0,
        write_off DOUBLE PRECISION NOT NULL DEFAULT 0,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        employee_name TEXT,
        status TEXT NOT NULL DEFAULT 'approved',
        is_paid INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
      CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    `,
  },
  {
    name: '004_audit_log',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        before_json JSONB,
        after_json JSONB,
        context_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
    `,
  },
  {
    name: '005_editing_presence',
    sql: `
      CREATE TABLE IF NOT EXISTS editing_presence (
        resource TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(resource, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_editing_presence_resource_updated
        ON editing_presence(resource, updated_at DESC);

      CREATE TABLE IF NOT EXISTS resource_state (
        resource TEXT PRIMARY KEY,
        last_changed_at TIMESTAMPTZ,
        last_changed_by TEXT
      );
    `,
  },
  {
    name: '006_role_permissions',
    sql: `
      CREATE TABLE IF NOT EXISTS role_permissions (
        role TEXT PRIMARY KEY,
        report_edit INTEGER NOT NULL DEFAULT 0,
        products_manage INTEGER NOT NULL DEFAULT 0,
        schedule_manage INTEGER NOT NULL DEFAULT 0,
        audit_view INTEGER NOT NULL DEFAULT 0,
        roles_manage INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO role_permissions(
        role,
        report_edit,
        products_manage,
        schedule_manage,
        audit_view,
        roles_manage
      )
      VALUES
        ('admin', 1, 1, 1, 1, 1),
        ('chef', 1, 0, 0, 0, 0),
        ('employee', 1, 0, 0, 0, 0)
      ON CONFLICT(role) DO NOTHING;
    `,
  },
  {
    name: '009_push_notifications',
    sql: `
      CREATE TABLE IF NOT EXISTS notification_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        push_enabled INTEGER NOT NULL DEFAULT 1,
        shifts_enabled INTEGER NOT NULL DEFAULT 1,
        reminders_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_success_at TIMESTAMPTZ,
        last_error_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
        ON push_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
        ON push_subscriptions(user_id, disabled_at);

      CREATE TABLE IF NOT EXISTS notification_marks (
        dedupe_key TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: '010_remove_messenger',
    sql: `
      DROP TABLE IF EXISTS message_attachments CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS conversation_members CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;

      ALTER TABLE notification_settings
        DROP COLUMN IF EXISTS messages_enabled;
    `,
  },
  {
    name: '011_schedule_template_shifts',
    sql: `
      CREATE TABLE IF NOT EXISTS schedule_template_shifts (
        id SERIAL PRIMARY KEY,
        day_index INTEGER NOT NULL CHECK(day_index BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_schedule_template_day_order
        ON schedule_template_shifts(day_index, sort_order, start_time);

      INSERT INTO schedule_template_shifts(day_index, start_time, end_time, sort_order)
      SELECT *
      FROM (
        VALUES
          (0, '09:00', '15:00', 0),
          (0, '14:00', '21:00', 1),
          (1, '09:00', '15:00', 0),
          (1, '14:00', '21:00', 1),
          (2, '09:00', '15:00', 0),
          (2, '14:00', '21:00', 1),
          (3, '09:00', '15:00', 0),
          (3, '14:00', '21:00', 1),
          (4, '09:00', '15:00', 0),
          (4, '14:00', '21:00', 1),
          (5, '09:00', '15:00', 0),
          (5, '14:00', '21:00', 1),
          (6, '09:00', '15:00', 0),
          (6, '09:00', '15:00', 1),
          (6, '14:00', '21:00', 2),
          (6, '14:00', '21:00', 3)
      ) AS default_rows(day_index, start_time, end_time, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM schedule_template_shifts);
    `,
  },
  {
    name: '012_daily_record_product_snapshots',
    sql: `
      ALTER TABLE daily_records
        ADD COLUMN IF NOT EXISTS product_name TEXT,
        ADD COLUMN IF NOT EXISTS product_category TEXT,
        ADD COLUMN IF NOT EXISTS product_unit TEXT;

      UPDATE daily_records dr
      SET
        product_name = COALESCE(dr.product_name, p.name),
        product_category = COALESCE(dr.product_category, p.category),
        product_unit = COALESCE(dr.product_unit, p.unit)
      FROM products p
      WHERE dr.product_id = p.id;

      ALTER TABLE daily_records
        ALTER COLUMN product_id DROP NOT NULL,
        ALTER COLUMN product_category SET DEFAULT 'other',
        ALTER COLUMN product_unit SET DEFAULT 'шт';

      DO $$
      DECLARE
        fk_name TEXT;
      BEGIN
        SELECT conname INTO fk_name
        FROM pg_constraint
        WHERE conrelid = 'daily_records'::regclass
          AND confrelid = 'products'::regclass
          AND contype = 'f'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE daily_records DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;

      ALTER TABLE daily_records
        ADD CONSTRAINT daily_records_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
    `,
  },
  {
    name: '013_soft_delete_shifts',
    sql: `
      ALTER TABLE shifts
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS delete_reason TEXT;

      CREATE INDEX IF NOT EXISTS idx_shifts_active_date
        ON shifts(date)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    name: '014_shift_unbook_requests',
    sql: `
      CREATE TABLE IF NOT EXISTS shift_unbook_requests (
        id SERIAL PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requester_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_unbook_requests_pending_unique
        ON shift_unbook_requests(shift_id, requester_user_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_shift_unbook_requests_status_created
        ON shift_unbook_requests(status, created_at DESC);
    `,
  },
  {
    name: '015_daily_report_status',
    sql: `
      CREATE TABLE IF NOT EXISTS daily_report_status (
        record_date TEXT PRIMARY KEY,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_daily_report_status_completed_at
        ON daily_report_status(completed_at DESC);
    `,
  },
]
