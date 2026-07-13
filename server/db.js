import {
  describeDatabase,
  getDatabaseConfig,
  PgDatabase,
} from './database/postgres.js'
import { runMigrations } from './database/migrate.js'
import { seedDefaultProducts } from './database/seed.js'

const config = getDatabaseConfig()

export const dbPath = describeDatabase(config)
export const db = new PgDatabase(config)

await runMigrations(db)
await seedDefaultProducts(db)

export { PgDatabase, getDatabaseConfig }
