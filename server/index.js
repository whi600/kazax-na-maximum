import { db, dbPath } from './db.js'
import { createAppServer } from './app.js'
import {
  startReminderLoop,
  stopReminderLoop,
} from './notifications.js'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 8787)
const appServer = createAppServer()

appServer.listen(PORT, HOST, () => {
  console.log(`API+Web server started on http://${HOST}:${PORT}`)
  console.log(`PostgreSQL database: ${dbPath}`)
  if (process.env.DISABLE_BACKGROUND_JOBS !== '1') startReminderLoop()
})

process.on('SIGINT', () => {
  console.log('\nShutting down...')
  stopReminderLoop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopReminderLoop()
  process.exit(0)
})
