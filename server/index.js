import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { db, dbPath } from './db.js'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 8787)
const SESSION_COOKIE = 'kof_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const MAX_BODY_SIZE = 1024 * 1024
const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

const distDir = path.resolve(process.cwd(), 'dist')
const hasDist = fs.existsSync(distDir)

const getUsersCountStatement = db.prepare('SELECT COUNT(*) AS count FROM users')
const getUserByEmailStatement = db.prepare('SELECT * FROM users WHERE email = ?')
const getUserByIdStatement = db.prepare(
  'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
)
const listUsersForRoleManageStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  ORDER BY created_at DESC, id DESC
`)
const updateUserRoleStatement = db.prepare(
  "UPDATE users SET role = ? WHERE id = ?",
)
const createUserStatement = db.prepare(
  'INSERT INTO users(email, password_hash, name, role) VALUES (?, ?, ?, ?)',
)
const createSessionStatement = db.prepare(
  'INSERT INTO sessions(id, user_id, expires_at) VALUES (?, ?, ?)',
)
const getSessionUserStatement = db.prepare(`
  SELECT
    s.id AS session_id,
    s.expires_at AS expires_at,
    u.id AS id,
    u.email AS email,
    u.name AS name,
    u.role AS role,
    u.created_at AS created_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`)
const deleteSessionStatement = db.prepare('DELETE FROM sessions WHERE id = ?')
const deleteExpiredSessionsStatement = db.prepare(
  "DELETE FROM sessions WHERE expires_at <= datetime('now')",
)

const listProductsStatement = db.prepare(
  'SELECT id, name, category, unit FROM products ORDER BY name',
)
const getProductByIdStatement = db.prepare(
  'SELECT id, name, category, unit FROM products WHERE id = ?',
)
const insertProductStatement = db.prepare(
  "INSERT INTO products(name, category, unit) VALUES (?, ?, ?)",
)
const updateProductStatement = db.prepare(
  "UPDATE products SET name = ?, category = ?, unit = ? WHERE id = ?",
)
const deleteProductStatement = db.prepare('DELETE FROM products WHERE id = ?')
const getRolePermissionsStatement = db.prepare(`
  SELECT
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage
  FROM role_permissions
  WHERE role = ?
`)
const listRolePermissionsStatement = db.prepare(`
  SELECT
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage
  FROM role_permissions
  ORDER BY role
`)
const upsertRolePermissionsStatement = db.prepare(`
  INSERT INTO role_permissions(
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(role)
  DO UPDATE SET
    report_edit = excluded.report_edit,
    products_manage = excluded.products_manage,
    schedule_manage = excluded.schedule_manage,
    audit_view = excluded.audit_view,
    roles_manage = excluded.roles_manage,
    updated_at = datetime('now')
`)

const listTodayRecordsStatement = db.prepare(`
  SELECT
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    p.name,
    p.category,
    p.unit
  FROM daily_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.record_date = ?
  ORDER BY p.name
`)

const deleteTodayRecordsStatement = db.prepare(
  'DELETE FROM daily_records WHERE record_date = ?',
)

const insertDailyRecordStatement = db.prepare(`
  INSERT INTO daily_records(record_date, product_id, arrival, remainder, write_off, user_id, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`)

const listArchiveRecordsStatement = db.prepare(`
  SELECT
    dr.id,
    dr.record_date,
    dr.product_id,
    dr.arrival,
    dr.remainder,
    dr.write_off,
    p.name AS product_name
  FROM daily_records dr
  JOIN products p ON p.id = dr.product_id
  ORDER BY dr.record_date DESC, p.name ASC
`)

const listUpcomingShiftsStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    status
  FROM shifts
  WHERE date >= ?
  ORDER BY date ASC, start_time ASC
`)

const listAllShiftsStatement = db.prepare(`
  SELECT
    id,
    date,
    start_time,
    end_time,
    employee_name,
    status
  FROM shifts
  ORDER BY date DESC, start_time DESC
`)

const getShiftByIdStatement = db.prepare(
  'SELECT id, date, start_time, end_time, employee_name, status FROM shifts WHERE id = ?',
)

const insertShiftStatement = db.prepare(`
  INSERT INTO shifts(date, start_time, end_time, employee_name, status, created_by, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`)

const updateShiftEmployeeStatement = db.prepare(
  "UPDATE shifts SET employee_name = ?, updated_at = datetime('now') WHERE id = ?",
)

const updateShiftStatusStatement = db.prepare(
  "UPDATE shifts SET status = ?, updated_at = datetime('now') WHERE id = ?",
)

const deleteShiftStatement = db.prepare('DELETE FROM shifts WHERE id = ?')
const upsertEditingPresenceStatement = db.prepare(`
  INSERT INTO editing_presence(resource, user_id, user_name, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(resource, user_id)
  DO UPDATE SET
    user_name = excluded.user_name,
    updated_at = datetime('now')
`)
const removeEditingPresenceStatement = db.prepare(
  'DELETE FROM editing_presence WHERE resource = ? AND user_id = ?',
)
const listEditingPresenceStatement = db.prepare(`
  SELECT resource, user_id, user_name, updated_at
  FROM editing_presence
  WHERE resource = ?
    AND updated_at >= datetime('now', '-35 seconds')
  ORDER BY updated_at DESC
`)
const upsertResourceStateStatement = db.prepare(`
  INSERT INTO resource_state(resource, last_changed_at, last_changed_by)
  VALUES (?, datetime('now'), ?)
  ON CONFLICT(resource)
  DO UPDATE SET
    last_changed_at = datetime('now'),
    last_changed_by = excluded.last_changed_by
`)
const getResourceStateStatement = db.prepare(
  'SELECT resource, last_changed_at, last_changed_by FROM resource_state WHERE resource = ?',
)
const insertAuditLogStatement = db.prepare(`
  INSERT INTO audit_log(
    actor_user_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    before_json,
    after_json,
    context_json,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`)
const listAuditLogStatement = db.prepare(`
  SELECT
    id,
    actor_user_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    before_json,
    after_json,
    context_json,
    created_at
  FROM audit_log
  ORDER BY created_at DESC, id DESC
  LIMIT ?
  OFFSET ?
`)

const sanitizeUser = (row) => {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  }
}

const toShiftDto = (row) => ({
  id: row.id,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
  employee_name: row.employee_name,
  status: row.status || 'approved',
})

const json = (res, statusCode, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const noContent = (res) => {
  res.writeHead(204)
  res.end()
}

const badRequest = (res, message) => json(res, 400, { error: message })
const unauthorized = (res, message = 'Требуется авторизация') =>
  json(res, 401, { error: message })
const forbidden = (res, message = 'Недостаточно прав') =>
  json(res, 403, { error: message })
const notFound = (res, message = 'Не найдено') => json(res, 404, { error: message })

const parseCookies = (req) => {
  const raw = req.headers.cookie
  if (!raw) return {}

  return raw.split(';').reduce((acc, entry) => {
    const [key, ...rest] = entry.trim().split('=')
    if (!key) return acc
    acc[key] = decodeURIComponent(rest.join('='))
    return acc
  }, {})
}

const setSessionCookie = (res, sessionId) => {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
  ]

  // Browsers accept Secure only on HTTPS; keep local development usable.
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  res.setHeader('Set-Cookie', parts.join('; '))
}

const clearSessionCookie = (res) => {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }
  res.setHeader('Set-Cookie', parts.join('; '))
}

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let total = 0
    let raw = ''

    req.on('data', (chunk) => {
      total += chunk.length
      if (total > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      raw += chunk
    })

    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })

    req.on('error', reject)
  })

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const verifyPassword = (password, stored) => {
  const [salt, hashHex] = String(stored || '').split(':')
  if (!salt || !hashHex) return false

  const hashBuffer = Buffer.from(hashHex, 'hex')
  const inputBuffer = scryptSync(password, salt, 64)

  if (hashBuffer.length !== inputBuffer.length) return false
  return timingSafeEqual(hashBuffer, inputBuffer)
}

const createSession = (userId) => {
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  createSessionStatement.run(sessionId, userId, expiresAt)
  return sessionId
}

const getCurrentUser = (req) => {
  deleteExpiredSessionsStatement.run()

  const cookies = parseCookies(req)
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) return null

  const row = getSessionUserStatement.get(sessionId)
  if (!row) return null

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSessionStatement.run(sessionId)
    return null
  }

  return sanitizeUser(row)
}

const requireUser = (req, res) => {
  const user = getCurrentUser(req)
  if (!user) {
    unauthorized(res)
    return null
  }
  return user
}

const requireAdmin = (req, res) => {
  const user = requireUser(req, res)
  if (!user) return null
  if (user.role !== 'admin') {
    forbidden(res)
    return null
  }
  return user
}

const isSuperAdminEmail = (email) =>
  String(email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL

const isSuperAdminUser = (user) => isSuperAdminEmail(user?.email)

const toBoolInt = (value, fallback = 0) => {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  return fallback
}

const mapPermissionsRow = (row) => {
  const source = row || {}
  return {
    reportEdit: toBoolInt(source.report_edit) === 1,
    productsManage: toBoolInt(source.products_manage) === 1,
    scheduleManage: toBoolInt(source.schedule_manage) === 1,
    auditView: toBoolInt(source.audit_view) === 1,
    rolesManage: toBoolInt(source.roles_manage) === 1,
  }
}

const getUserPermissions = (user) => {
  const row = getRolePermissionsStatement.get(user?.role || 'employee')
  return mapPermissionsRow(row)
}

const requirePermission = (req, res, key) => {
  const user = requireUser(req, res)
  if (!user) return null

  const permissions = getUserPermissions(user)
  if (!permissions[key]) {
    forbidden(res)
    return null
  }

  return { user, permissions }
}

const normalizeRole = (value) => {
  const role = String(value || '').toLowerCase().trim()
  if (!role) return 'employee'
  if (role === 'owner') return 'admin'
  if (role === 'chef') return 'chef'
  if (role === 'admin') return 'admin'
  return 'employee'
}

const getToday = () => new Date().toISOString().slice(0, 10)

const withErrorHandling = async (res, fn) => {
  try {
    await fn()
  } catch (error) {
    console.error(error)
    json(res, 500, { error: 'Внутренняя ошибка сервера' })
  }
}

const parseShiftId = (pathname) => {
  const match = pathname.match(/^\/api\/shifts\/(\d+)(?:\/([a-z-]+))?$/)
  if (!match) return null
  return {
    id: Number(match[1]),
    action: match[2] || null,
  }
}

const parseProductId = (pathname) => {
  const match = pathname.match(/^\/api\/products\/(\d+)$/)
  if (!match) return null
  return Number(match[1])
}

const parseUserId = (pathname) => {
  const match = pathname.match(/^\/api\/users\/(\d+)\/role$/)
  if (!match) return null
  return Number(match[1])
}

const isEditableResource = (value) =>
  value === 'schedule' || value === 'assortment'

const parseInteger = (value, fallback) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

const toAuditPayload = (value) => {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

const logAudit = ({
  actorUser,
  entityType,
  entityId = null,
  action,
  before = null,
  after = null,
  context = null,
}) => {
  if (!actorUser?.id || !action || !entityType) return

  insertAuditLogStatement.run(
    actorUser.id,
    actorUser.name || actorUser.email || 'system',
    String(entityType),
    entityId === null || entityId === undefined ? null : String(entityId),
    String(action),
    toAuditPayload(before),
    toAuditPayload(after),
    toAuditPayload(context),
  )
}

const touchResource = (resource, actorUser) => {
  if (!isEditableResource(resource)) return
  upsertResourceStateStatement.run(resource, actorUser?.name || actorUser?.email || 'system')
}

const normalizeProductCategory = (value) => {
  const category = String(value || '').trim().toLowerCase()
  if (category === 'bakery' || category === 'pastry' || category === 'other') {
    return category
  }
  return 'other'
}

const normalizePersonName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

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

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const displayName = String(body.displayName || body.name || '').trim()

      if (!email || !email.includes('@')) {
        badRequest(res, 'Укажите корректный email')
        return
      }
      if (password.length < 6) {
        badRequest(res, 'Пароль должен быть не короче 6 символов')
        return
      }

      const existing = getUserByEmailStatement.get(email)
      if (existing) {
        json(res, 409, { error: 'Пользователь с таким email уже существует' })
        return
      }

      const usersCount = getUsersCountStatement.get().count
      const role =
        usersCount === 0 || adminEmails.has(email)
          ? 'admin'
          : normalizeRole(body.role)

      const name = displayName || email.split('@')[0] || 'Сотрудник'
      const passwordHash = hashPassword(password)
      const insertResult = createUserStatement.run(email, passwordHash, name, role)
      const userId = Number(insertResult.lastInsertRowid)
      const user = getUserByIdStatement.get(userId)

      const sessionId = createSession(userId)
      setSessionCookie(res, sessionId)
      json(res, 201, { user: sanitizeUser(user) })
      return
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')

      const user = getUserByEmailStatement.get(email)
      if (!user || !verifyPassword(password, user.password_hash)) {
        unauthorized(res, 'Неверный email или пароль')
        return
      }

      const sessionId = createSession(user.id)
      setSessionCookie(res, sessionId)
      json(res, 200, { user: sanitizeUser(user) })
      return
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req)
      const sessionId = cookies[SESSION_COOKIE]
      if (sessionId) {
        deleteSessionStatement.run(sessionId)
      }
      clearSessionCookie(res)
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = getCurrentUser(req)
      json(res, 200, { user })
      return
    }

    if (pathname === '/api/auth/permissions' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return
      json(res, 200, {
        permissions: getUserPermissions(user),
        isSuperAdmin: isSuperAdminUser(user),
      })
      return
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const products = listProductsStatement.all()
      json(res, 200, { products })
      return
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      const access = requirePermission(req, res, 'productsManage')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const name = String(body.name || '').trim()
      const unit = String(body.unit || 'шт').trim() || 'шт'
      const category = normalizeProductCategory(body.category)

      if (!name) {
        badRequest(res, 'Укажите название товара')
        return
      }

      const result = insertProductStatement.run(name, category, unit)
      const product = getProductByIdStatement.get(Number(result.lastInsertRowid))
      touchResource('assortment', user)
      logAudit({
        actorUser: user,
        entityType: 'product',
        entityId: product?.id,
        action: 'product.create',
        after: product,
      })
      json(res, 201, { product })
      return
    }

    const productId = parseProductId(pathname)
    if (productId && req.method === 'PATCH') {
      const access = requirePermission(req, res, 'productsManage')
      if (!access) return
      const { user } = access

      const existing = getProductByIdStatement.get(productId)
      if (!existing) {
        notFound(res, 'Товар не найден')
        return
      }

      const body = await readJsonBody(req)
      const name = String(body.name || '').trim()
      const unit = String(body.unit || '').trim()
      const category = normalizeProductCategory(body.category)

      if (!name) {
        badRequest(res, 'Укажите название товара')
        return
      }
      if (!unit) {
        badRequest(res, 'Укажите единицу измерения')
        return
      }

      updateProductStatement.run(name, category, unit, productId)
      const product = getProductByIdStatement.get(productId)
      touchResource('assortment', user)
      logAudit({
        actorUser: user,
        entityType: 'product',
        entityId: productId,
        action: 'product.update',
        before: existing,
        after: product,
      })
      json(res, 200, { product })
      return
    }

    if (productId && req.method === 'DELETE') {
      const access = requirePermission(req, res, 'productsManage')
      if (!access) return
      const { user } = access

      const existing = getProductByIdStatement.get(productId)
      if (!existing) {
        notFound(res, 'Товар не найден')
        return
      }

      deleteProductStatement.run(productId)
      touchResource('assortment', user)
      logAudit({
        actorUser: user,
        entityType: 'product',
        entityId: productId,
        action: 'product.delete',
        before: existing,
      })
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/daily-records/today' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const today = getToday()
      const rows = listTodayRecordsStatement.all(today)
      const entries = rows.map((row) => ({
        product_id: row.product_id,
        name: row.name,
        category: row.category,
        unit: row.unit,
        arrival: row.arrival,
        remainder: row.remainder,
        write_off: row.write_off,
      }))

      json(res, 200, { entries })
      return
    }

    if (pathname === '/api/daily-records/today' && req.method === 'PUT') {
      const access = requirePermission(req, res, 'reportEdit')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const entries = Array.isArray(body.entries) ? body.entries : []
      const today = getToday()

      db.exec('BEGIN')
      try {
        deleteTodayRecordsStatement.run(today)

        for (const item of entries) {
          const productId = Number(item.product_id)
          if (!Number.isFinite(productId)) continue

          const arrival = Number(item.arrival || 0)
          const remainder = Number(item.remainder || 0)
          const writeOff = Number(item.write_off || 0)
          const normalizedArrival = Number.isFinite(arrival) ? arrival : 0
          const normalizedRemainder = Number.isFinite(remainder) ? remainder : 0
          const normalizedWriteOff = Number.isFinite(writeOff) ? writeOff : 0

          if (
            normalizedArrival === 0 &&
            normalizedRemainder === 0 &&
            normalizedWriteOff === 0
          ) {
            continue
          }

          insertDailyRecordStatement.run(
            today,
            productId,
            normalizedArrival,
            normalizedRemainder,
            normalizedWriteOff,
            user.id,
          )
        }

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/archive/records' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const rows = listArchiveRecordsStatement.all()
      const records = rows.map((row) => ({
        id: row.id,
        product_id: row.product_id,
        arrival: row.arrival,
        remainder: row.remainder,
        write_off: row.write_off,
        created_at: row.record_date,
        products: { name: row.product_name },
      }))

      json(res, 200, { records })
      return
    }

    if (pathname === '/api/shifts/upcoming' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const rows = listUpcomingShiftsStatement.all(getToday())
      json(res, 200, { shifts: rows.map(toShiftDto) })
      return
    }

    if (pathname === '/api/shifts/archive' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const rows = listAllShiftsStatement.all()
      json(res, 200, { shifts: rows.map(toShiftDto) })
      return
    }

    if (pathname === '/api/shifts/help-request' && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const date = String(body.date || '')
      const startTime = String(body.start_time || '')
      const endTime = String(body.end_time || '')

      if (!date || !startTime || !endTime) {
        badRequest(res, 'Заполните дату и время')
        return
      }

      const result = insertShiftStatement.run(
        date,
        startTime,
        endTime,
        user.name,
        'pending',
        user.id,
      )
      touchResource('schedule', user)
      logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: Number(result.lastInsertRowid),
        action: 'shift.help_request',
        after: {
          date,
          start_time: startTime,
          end_time: endTime,
          employee_name: user.name,
          status: 'pending',
        },
      })

      json(res, 201, { id: Number(result.lastInsertRowid) })
      return
    }

    if (pathname === '/api/shifts/admin-create' && req.method === 'POST') {
      const access = requirePermission(req, res, 'scheduleManage')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const date = String(body.date || '')
      const startTime = String(body.start_time || '')
      const endTime = String(body.end_time || '')

      if (!date || !startTime || !endTime) {
        badRequest(res, 'Заполните дату и время')
        return
      }

      const result = insertShiftStatement.run(
        date,
        startTime,
        endTime,
        null,
        'approved',
        user.id,
      )
      touchResource('schedule', user)
      logAudit({
        actorUser: user,
        entityType: 'shift',
        entityId: Number(result.lastInsertRowid),
        action: 'shift.admin_create',
        after: {
          date,
          start_time: startTime,
          end_time: endTime,
          employee_name: null,
          status: 'approved',
        },
      })

      json(res, 201, { id: Number(result.lastInsertRowid) })
      return
    }

    if (pathname === '/api/shifts/bulk-save' && req.method === 'POST') {
      const access = requirePermission(req, res, 'scheduleManage')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const deletedIds = Array.isArray(body.deletedIds) ? body.deletedIds : []
      const newShifts = Array.isArray(body.newShifts) ? body.newShifts : []

      db.exec('BEGIN')
      try {
        const deletedSnapshot = []
        for (const id of deletedIds) {
          const shiftId = Number(id)
          if (!Number.isFinite(shiftId)) continue
          const existingShift = getShiftByIdStatement.get(shiftId)
          if (existingShift) deletedSnapshot.push(existingShift)
          deleteShiftStatement.run(shiftId)
        }

        const createdIds = []
        for (const shift of newShifts) {
          const date = String(shift.date || '')
          const startTime = String(shift.start_time || '')
          const endTime = String(shift.end_time || '')
          if (!date || !startTime || !endTime) continue

          const result = insertShiftStatement.run(
            date,
            startTime,
            endTime,
            null,
            'approved',
            user.id,
          )
          createdIds.push(Number(result.lastInsertRowid))
        }

        db.exec('COMMIT')
        touchResource('schedule', user)
        if (deletedSnapshot.length > 0 || createdIds.length > 0) {
          logAudit({
            actorUser: user,
            entityType: 'shift',
            action: 'shift.bulk_save',
            before: { deleted: deletedSnapshot },
            after: { createdIds, createdCount: createdIds.length },
            context: {
              deletedCount: deletedSnapshot.length,
              createdCount: createdIds.length,
            },
          })
        }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      json(res, 200, { ok: true })
      return
    }

    const shiftAction = parseShiftId(pathname)
    if (shiftAction) {
      const authUser = requireUser(req, res)
      if (!authUser) return

      const shift = getShiftByIdStatement.get(shiftAction.id)
      if (!shift) {
        notFound(res, 'Смена не найдена')
        return
      }

      if (req.method === 'PATCH' && shiftAction.action === 'book') {
        if (shift.employee_name) {
          badRequest(res, 'Смена уже занята')
          return
        }

        updateShiftEmployeeStatement.run(authUser.name, shiftAction.id)
        touchResource('schedule', authUser)
        logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.book',
          before: shift,
          after: { ...shift, employee_name: authUser.name },
        })
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'PATCH' && shiftAction.action === 'unbook') {
        const authPermissions = getUserPermissions(authUser)
        if (
          !authPermissions.scheduleManage &&
          normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
        ) {
          forbidden(res)
          return
        }

        updateShiftEmployeeStatement.run(null, shiftAction.id)
        touchResource('schedule', authUser)
        logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.unbook',
          before: shift,
          after: { ...shift, employee_name: null },
        })
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'PATCH' && shiftAction.action === 'approve') {
        const authPermissions = getUserPermissions(authUser)
        if (!authPermissions.scheduleManage) {
          forbidden(res)
          return
        }

        updateShiftStatusStatement.run('approved', shiftAction.id)
        touchResource('schedule', authUser)
        logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.approve',
          before: shift,
          after: { ...shift, status: 'approved' },
        })
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'DELETE' && !shiftAction.action) {
        const authPermissions = getUserPermissions(authUser)
        if (!authPermissions.scheduleManage) {
          forbidden(res)
          return
        }

        deleteShiftStatement.run(shiftAction.id)
        touchResource('schedule', authUser)
        logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.delete',
          before: shift,
        })
        json(res, 200, { ok: true })
        return
      }
    }

    if (pathname === '/api/audit' && req.method === 'GET') {
      const access = requirePermission(req, res, 'auditView')
      if (!access) return

      const limit = Math.max(1, Math.min(100, parseInteger(requestUrl.searchParams.get('limit'), 50)))
      const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
      const rows = listAuditLogStatement.all(limit, offset)
      const logs = rows.map((row) => ({
        id: row.id,
        actor_user_id: row.actor_user_id,
        actor_name: row.actor_name,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        before: row.before_json ? JSON.parse(row.before_json) : null,
        after: row.after_json ? JSON.parse(row.after_json) : null,
        context: row.context_json ? JSON.parse(row.context_json) : null,
        created_at: row.created_at,
      }))

      json(res, 200, { logs })
      return
    }

    if (pathname === '/api/editing/heartbeat' && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const resource = String(body.resource || '').trim()
      const active = body.active !== false

      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      if (active) {
        upsertEditingPresenceStatement.run(resource, user.id, user.name || user.email)
      } else {
        removeEditingPresenceStatement.run(resource, user.id)
      }

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/editing/touch' && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const resource = String(body.resource || '').trim()

      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      touchResource(resource, user)
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/editing/status' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const resource = String(requestUrl.searchParams.get('resource') || '').trim()
      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      const activeEditors = listEditingPresenceStatement
        .all(resource)
        .filter((row) => row.user_id !== user.id)
        .map((row) => ({
          user_id: row.user_id,
          user_name: row.user_name,
          updated_at: row.updated_at,
        }))

      const state = getResourceStateStatement.get(resource)
      json(res, 200, {
        activeEditors,
        lastChangedAt: state?.last_changed_at || null,
        lastChangedBy: state?.last_changed_by || null,
      })
      return
    }

    if (pathname === '/api/roles/permissions' && req.method === 'GET') {
      const access = requirePermission(req, res, 'rolesManage')
      if (!access) return

      const rows = listRolePermissionsStatement.all()
      const roles = rows.map((row) => ({
        role: row.role,
        permissions: mapPermissionsRow(row),
      }))

      json(res, 200, { roles })
      return
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      const access = requirePermission(req, res, 'rolesManage')
      if (!access) return

      const users = listUsersForRoleManageStatement.all().map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        created_at: row.created_at,
        isSuperAdmin: isSuperAdminEmail(row.email),
      }))

      json(res, 200, { users })
      return
    }

    const userRoleTargetId = parseUserId(pathname)
    if (userRoleTargetId && req.method === 'PUT') {
      const access = requirePermission(req, res, 'rolesManage')
      if (!access) return
      const { user: actorUser } = access

      const targetUser = getUserByIdStatement.get(userRoleTargetId)
      if (!targetUser) {
        notFound(res, 'Пользователь не найден')
        return
      }

      const body = await readJsonBody(req)
      const rawRole = String(body.role || '')
        .trim()
        .toLowerCase()
      const allowedRoles = new Set(['employee', 'chef', 'admin'])
      if (!allowedRoles.has(rawRole)) {
        badRequest(res, 'Недопустимая роль')
        return
      }
      const nextRole = rawRole

      const actorIsSuper = isSuperAdminUser(actorUser)
      const targetIsSuper = isSuperAdminEmail(targetUser.email)

      if (!actorIsSuper && targetIsSuper) {
        forbidden(res, 'Роль супер-админа может менять только супер-админ')
        return
      }

      if (!actorIsSuper && targetUser.role === 'admin') {
        forbidden(res, 'Только супер-админ может менять роль у администраторов')
        return
      }

      if (targetIsSuper) {
        badRequest(res, 'Роль супер-админа нельзя изменить')
        return
      }

      updateUserRoleStatement.run(nextRole, userRoleTargetId)
      const updatedUser = getUserByIdStatement.get(userRoleTargetId)

      logAudit({
        actorUser,
        entityType: 'user',
        entityId: userRoleTargetId,
        action: 'user.role_update',
        before: { role: targetUser.role, email: targetUser.email, name: targetUser.name },
        after: { role: updatedUser.role, email: updatedUser.email, name: updatedUser.name },
      })

      json(res, 200, {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          created_at: updatedUser.created_at,
          isSuperAdmin: isSuperAdminEmail(updatedUser.email),
        },
      })
      return
    }

    if (pathname === '/api/roles/permissions' && req.method === 'PUT') {
      const access = requirePermission(req, res, 'rolesManage')
      if (!access) return

      const body = await readJsonBody(req)
      const roles = Array.isArray(body.roles) ? body.roles : []
      const allowedRoles = new Set(['chef', 'employee'])

      db.exec('BEGIN')
      try {
        for (const item of roles) {
          const role = String(item?.role || '')
          if (!allowedRoles.has(role)) continue
          const permissions = item.permissions || {}

          upsertRolePermissionsStatement.run(
            role,
            toBoolInt(permissions.reportEdit),
            toBoolInt(permissions.productsManage),
            toBoolInt(permissions.scheduleManage),
            toBoolInt(permissions.auditView),
            toBoolInt(permissions.rolesManage),
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      const rows = listRolePermissionsStatement.all()
      const responseRoles = rows.map((row) => ({
        role: row.role,
        permissions: mapPermissionsRow(row),
      }))

      json(res, 200, { roles: responseRoles })
      return
    }

    if (pathname.startsWith('/api/')) {
      notFound(res)
      return
    }

    if (!hasDist) {
      json(res, 404, {
        error:
          'Фронтенд не собран. Запустите `npm run dev` для разработки или `npm run build` для прод-режима.',
      })
      return
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname
    const safePath = path
      .normalize(requestedPath)
      .replace(/^\.\.(?:\/|\\|$)+/, '')

    const absolutePath = path.join(distDir, safePath)
    const insideDist = absolutePath.startsWith(distDir)
    const filePath = insideDist && fs.existsSync(absolutePath) ? absolutePath : null

    const fallbackPath = path.join(distDir, 'index.html')
    const outputPath = filePath || fallbackPath

    const ext = path.extname(outputPath)
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const data = fs.readFileSync(outputPath)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': outputPath.endsWith('index.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    })
    res.end(data)
  })
})

appServer.listen(PORT, HOST, () => {
  console.log(`API+Web server started on http://${HOST}:${PORT}`)
  console.log(`SQLite database: ${dbPath}`)
})

process.on('SIGINT', () => {
  console.log('\nShutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  process.exit(0)
})
