import http from 'node:http'
import path from 'node:path'
import { db, dbPath } from './db.js'
import {
  json,
  noContent,
  notFound,
  withErrorHandling,
} from './http.js'
import { createStaticFileServer } from './static.js'
import {
  startReminderLoop,
  stopReminderLoop,
} from './notifications.js'
import { deleteExpiredSessionsStatement } from './statements.js'
import { handleAdminRoutes } from './routes/admin-routes.js'
import { handleAuthRoutes } from './routes/auth-routes.js'
import { handleNotificationRoutes } from './routes/notification-routes.js'
import { handleProductRecordRoutes } from './routes/product-record-routes.js'
import { handleScheduleTemplateRoutes } from './routes/schedule-template-routes.js'
import { handleShiftRoutes } from './routes/shift-routes.js'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 8787)
const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)

const distDir = path.resolve(process.cwd(), 'dist')
const serveStaticFile = createStaticFileServer({ distDir, json })

const appServer = http.createServer((req, res) => {
  withErrorHandling(res, async () => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`)
    const { pathname } = requestUrl

    if (req.method === 'OPTIONS') {
      noContent(res)
      return
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      json(res, 200, {
        ok: true,
        db: dbPath,
        now: new Date().toISOString(),
      })
      return
    }

    if (await handleAuthRoutes({ req, res, pathname, adminEmails })) {
      return
    }

    if (await handleNotificationRoutes({ req, res, pathname })) {
      return
    }

    if (await handleProductRecordRoutes({ req, res, pathname, db })) {
      return
    }

    if (await handleShiftRoutes({ req, res, pathname, db })) {
      return
    }

    if (await handleScheduleTemplateRoutes({ req, res, pathname, db })) {
      return
    }

    if (await handleAdminRoutes({ req, res, pathname, requestUrl, db })) {
      return
    }

    if (pathname.startsWith('/api/')) {
      notFound(res)
      return
    }

    serveStaticFile(req, res, pathname)
  })
})

appServer.listen(PORT, HOST, () => {
  console.log(`API+Web server started on http://${HOST}:${PORT}`)
  console.log(`PostgreSQL database: ${dbPath}`)
  startReminderLoop()
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
