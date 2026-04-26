import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const args = process.argv.slice(2)
const replaceTarget = args.includes('--replace')
const sqliteArg = args.find((arg) => !arg.startsWith('--'))
const sqlitePath = path.resolve(process.cwd(), sqliteArg || 'data/kofeteriy.sqlite')

process.env.SKIP_DEFAULT_PRODUCTS = process.env.SKIP_DEFAULT_PRODUCTS || '1'
const { db } = await import('../server/db.js')

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true })

const tableExists = (table) => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return Boolean(row)
}

const sqliteColumns = (table) => {
  if (!tableExists(table)) return new Set()
  return new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name))
}

const rowsFor = (table) => {
  if (!tableExists(table)) return []
  return sqlite.prepare(`SELECT * FROM ${table}`).all()
}

const jsonValue = (value) => {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const normalizeRow = (row) => ({
  ...row,
  before_json: jsonValue(row.before_json),
  after_json: jsonValue(row.after_json),
  context_json: jsonValue(row.context_json),
})

const insertRows = async (client, table, columns, rows, conflictColumns) => {
  if (rows.length === 0) return 0

  const existingColumns = sqliteColumns(table)
  const actualColumns = columns.filter((column) => existingColumns.has(column))
  if (actualColumns.length === 0) return 0

  const names = actualColumns.map((column) => `"${column}"`).join(', ')
  const placeholders = actualColumns.map((_, index) => `$${index + 1}`).join(', ')
  const conflict = conflictColumns.map((column) => `"${column}"`).join(', ')
  const updates = actualColumns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ')
  const sql = `
    INSERT INTO "${table}"(${names})
    VALUES (${placeholders})
    ON CONFLICT(${conflict})
    ${updates ? `DO UPDATE SET ${updates}` : 'DO NOTHING'}
  `

  for (const sourceRow of rows) {
    const row = normalizeRow(sourceRow)
    await client.query(
      sql,
      actualColumns.map((column) => row[column] ?? null),
    )
  }

  return rows.length
}

const resetSequence = async (client, table) => {
  const { rows } = await client.query(`
    SELECT pg_get_serial_sequence($1, 'id') AS sequence_name
  `, [table])
  const sequenceName = rows[0]?.sequence_name
  if (!sequenceName) return
  await client.query(`
    SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT MAX(id) IS NOT NULL FROM "${table}"))
  `, [sequenceName])
}

const truncateTarget = async (client) => {
  await client.query(`
    TRUNCATE TABLE
      message_attachments,
      messages,
      conversation_members,
      conversations,
      role_permissions,
      resource_state,
      editing_presence,
      audit_log,
      shifts,
      daily_records,
      products,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `)
}

const tables = [
  {
    name: 'users',
    columns: ['id', 'email', 'password_hash', 'name', 'role', 'created_at'],
    conflict: ['id'],
  },
  {
    name: 'sessions',
    columns: ['id', 'user_id', 'expires_at', 'created_at'],
    conflict: ['id'],
  },
  {
    name: 'products',
    columns: ['id', 'name', 'category', 'unit', 'created_at'],
    conflict: ['id'],
  },
  {
    name: 'daily_records',
    columns: [
      'id',
      'record_date',
      'product_id',
      'arrival',
      'remainder',
      'write_off',
      'user_id',
      'created_at',
      'updated_at',
    ],
    conflict: ['id'],
  },
  {
    name: 'shifts',
    columns: [
      'id',
      'date',
      'start_time',
      'end_time',
      'employee_name',
      'status',
      'is_paid',
      'created_by',
      'created_at',
      'updated_at',
    ],
    conflict: ['id'],
  },
  {
    name: 'audit_log',
    columns: [
      'id',
      'actor_user_id',
      'actor_name',
      'entity_type',
      'entity_id',
      'action',
      'before_json',
      'after_json',
      'context_json',
      'created_at',
    ],
    conflict: ['id'],
  },
  {
    name: 'editing_presence',
    columns: ['resource', 'user_id', 'user_name', 'updated_at'],
    conflict: ['resource', 'user_id'],
  },
  {
    name: 'resource_state',
    columns: ['resource', 'last_changed_at', 'last_changed_by'],
    conflict: ['resource'],
  },
  {
    name: 'role_permissions',
    columns: [
      'role',
      'report_edit',
      'products_manage',
      'schedule_manage',
      'audit_view',
      'roles_manage',
      'updated_at',
    ],
    conflict: ['role'],
  },
  {
    name: 'conversations',
    columns: [
      'id',
      'type',
      'title',
      'direct_key',
      'created_by',
      'created_at',
      'updated_at',
    ],
    conflict: ['id'],
  },
  {
    name: 'conversation_members',
    columns: ['conversation_id', 'user_id', 'joined_at', 'last_read_at'],
    conflict: ['conversation_id', 'user_id'],
  },
  {
    name: 'messages',
    columns: [
      'id',
      'conversation_id',
      'sender_user_id',
      'body',
      'reply_to_message_id',
      'created_at',
    ],
    conflict: ['id'],
  },
  {
    name: 'message_attachments',
    columns: [
      'id',
      'message_id',
      'original_name',
      'stored_name',
      'mime_type',
      'size',
      'storage_path',
      'created_at',
    ],
    conflict: ['id'],
  },
]

console.log(`Migrating SQLite data from ${sqlitePath}`)
if (replaceTarget) {
  console.log('Target PostgreSQL data will be replaced (--replace)')
}

await db.transaction(async (client) => {
  if (replaceTarget) {
    await truncateTarget(client)
  }

  for (const table of tables) {
    const count = await insertRows(
      client,
      table.name,
      table.columns,
      rowsFor(table.name),
      table.conflict,
    )
    console.log(`${table.name}: ${count}`)
  }

  for (const table of tables.filter((item) => item.columns.includes('id'))) {
    await resetSequence(client, table.name)
  }
})

sqlite.close()
await db.close()

console.log('Migration complete')
