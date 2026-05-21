import pg from 'pg'

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL || ''

const poolConfig = databaseUrl
  ? { connectionString: databaseUrl }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'kofeteriy',
      user: process.env.PGUSER || 'kofeteriy',
      password: process.env.PGPASSWORD || 'kofeteriy',
    }

export const dbPath = databaseUrl
  ? databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@')
  : `${poolConfig.user}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`

const normalizeSql = (sql) => {
  let index = 0
  return sql
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\?/g, () => `$${++index}`)
}

class PgStatement {
  constructor(database, sql) {
    this.database = database
    this.sql = normalizeSql(sql)
  }

  async all(...params) {
    const result = await this.database.query(this.sql, params)
    return result.rows
  }

  async get(...params) {
    const rows = await this.all(...params)
    return rows[0]
  }

  async run(...params) {
    const result = await this.database.query(this.sql, params)
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id ?? null,
    }
  }

  async allOn(client, ...params) {
    const result = await client.query(this.sql, params)
    return result.rows
  }

  async getOn(client, ...params) {
    const rows = await this.allOn(client, ...params)
    return rows[0]
  }

  async runOn(client, ...params) {
    const result = await client.query(this.sql, params)
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id ?? null,
    }
  }
}

class PgDatabase {
  constructor(config) {
    this.pool = new Pool(config)
  }

  prepare(sql) {
    return new PgStatement(this, sql)
  }

  async query(sql, params = []) {
    return this.pool.query(normalizeSql(sql), params)
  }

  async exec(sql) {
    return this.pool.query(normalizeSql(sql))
  }

  async transaction(callback) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async close() {
    await this.pool.end()
  }
}

export const db = new PgDatabase(poolConfig)

await db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const migrations = [
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
]

const appliedMigrationRows = await db.prepare('SELECT name FROM migrations').all()
const appliedMigrations = new Set(appliedMigrationRows.map((row) => row.name))

for (const migration of migrations) {
  if (appliedMigrations.has(migration.name)) continue

  await db.transaction(async (client) => {
    await client.query(migration.sql)
    await client.query('INSERT INTO migrations(name) VALUES ($1)', [migration.name])
  })
}

const defaultProducts = [
  { name: 'Хлеб белый', category: 'bakery', unit: 'шт' },
  { name: 'Багет', category: 'bakery', unit: 'шт' },
  { name: 'Круассан', category: 'pastry', unit: 'шт' },
  { name: 'Эклер', category: 'pastry', unit: 'шт' },
  { name: 'Чизкейк порция', category: 'pastry', unit: 'порц' },
  { name: 'Слойка с ветчиной', category: 'bakery', unit: 'шт' },
]

const shouldSeedDefaultProducts = process.env.SKIP_DEFAULT_PRODUCTS !== '1'
const productsCount = await db.prepare('SELECT COUNT(*)::int AS count FROM products').get()
if (shouldSeedDefaultProducts && productsCount.count === 0) {
  const insertProduct = db.prepare(
    'INSERT INTO products(name, category, unit) VALUES (?, ?, ?)',
  )
  await db.transaction(async (client) => {
    for (const product of defaultProducts) {
      await insertProduct.runOn(client, product.name, product.category, product.unit)
    }
  })
}
