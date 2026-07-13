import http from 'node:http'
import path from 'node:path'
import { db, dbPath } from './db.js'
import { json, noContent, notFound, withErrorHandling } from './http.js'
import { handleApiRoutes } from './routes/index.js'
import { createStaticFileServer } from './static.js'

export const parseAdminEmails = (value = process.env.ADMIN_EMAILS) =>
  new Set(
    String(value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )

export const createRequestHandler = ({
  database = db,
  databasePath = dbPath,
  adminEmails = parseAdminEmails(),
  distDir = path.resolve(process.cwd(), 'dist'),
} = {}) => {
  const serveStaticFile = createStaticFileServer({ distDir, json })

  return (req, res) => {
    withErrorHandling(res, async () => {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const { pathname } = requestUrl

      if (req.method === 'OPTIONS') {
        noContent(res)
        return
      }

      if (pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, {
          ok: true,
          db: databasePath,
          now: new Date().toISOString(),
        })
        return
      }

      const handled = await handleApiRoutes({
        req,
        res,
        pathname,
        requestUrl,
        db: database,
        adminEmails,
      })
      if (handled) return

      if (pathname.startsWith('/api/')) {
        notFound(res)
        return
      }

      serveStaticFile(req, res, pathname)
    })
  }
}

export const createAppServer = (options = {}) =>
  http.createServer(createRequestHandler(options))
