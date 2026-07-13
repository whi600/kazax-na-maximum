import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString || !connectionString.includes('kofeteriy_test')) {
  throw new Error('Refusing to reset a database that is not explicitly named kofeteriy_test')
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  await client.query('DROP SCHEMA public CASCADE')
  await client.query('CREATE SCHEMA public')
} finally {
  await client.end()
}
