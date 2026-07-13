import pg from 'pg'

const { Pool } = pg

export const normalizeSql = (sql) => {
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

export class PgDatabase {
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

export const getDatabaseConfig = (env = process.env) => {
  const databaseUrl = env.DATABASE_URL || ''
  if (databaseUrl) return { connectionString: databaseUrl }

  return {
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || 'kofeteriy',
    user: env.PGUSER || 'kofeteriy',
    password: env.PGPASSWORD || 'kofeteriy',
  }
}

export const describeDatabase = (config) =>
  config.connectionString
    ? config.connectionString.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@')
    : `${config.user}@${config.host}:${config.port}/${config.database}`
