import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  clearSessionCookie as clearSessionCookieHeader,
  forbidden,
  parseCookies,
  setSessionCookie as setSessionCookieHeader,
  unauthorized,
} from './http.js'
import {
  createSessionStatement,
  deleteExpiredSessionsStatement,
  deleteSessionStatement,
  getRolePermissionsStatement,
  getSessionUserStatement,
} from './statements.js'

export const SESSION_COOKIE = 'kof_session'
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
export const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

export const sanitizeUser = (row) => {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  }
}

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export const verifyPassword = (password, stored) => {
  const [salt, hashHex] = String(stored || '').split(':')
  if (!salt || !hashHex) return false

  const hashBuffer = Buffer.from(hashHex, 'hex')
  const inputBuffer = scryptSync(password, salt, 64)

  if (hashBuffer.length !== inputBuffer.length) return false
  return timingSafeEqual(hashBuffer, inputBuffer)
}

export const createSession = async (userId) => {
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await createSessionStatement.run(sessionId, userId, expiresAt)
  return sessionId
}

export const setSessionCookie = (res, sessionId) => {
  setSessionCookieHeader({
    res,
    sessionCookie: SESSION_COOKIE,
    sessionTtlMs: SESSION_TTL_MS,
    sessionId,
  })
}

export const clearSessionCookie = (res) => {
  clearSessionCookieHeader({ res, sessionCookie: SESSION_COOKIE })
}

export const getCurrentUser = async (req) => {
  await deleteExpiredSessionsStatement.run()

  const cookies = parseCookies(req)
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) return null

  const row = await getSessionUserStatement.get(sessionId)
  if (!row) return null

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSessionStatement.run(sessionId)
    return null
  }

  return sanitizeUser(row)
}

export const requireUser = async (req, res) => {
  const user = await getCurrentUser(req)
  if (!user) {
    unauthorized(res)
    return null
  }
  return user
}

export const requireAdmin = async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return null
  if (user.role !== 'admin') {
    forbidden(res)
    return null
  }
  return user
}

export const isSuperAdminEmail = (email) =>
  String(email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL

export const isSuperAdminUser = (user) => isSuperAdminEmail(user?.email)

export const toBoolInt = (value, fallback = 0) => {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  return fallback
}

export const mapPermissionsRow = (row) => {
  const source = row || {}
  return {
    reportEdit: toBoolInt(source.report_edit) === 1,
    productsManage: toBoolInt(source.products_manage) === 1,
    scheduleManage: toBoolInt(source.schedule_manage) === 1,
    auditView: toBoolInt(source.audit_view) === 1,
    rolesManage: toBoolInt(source.roles_manage) === 1,
  }
}

export const getUserPermissions = async (user) => {
  const row = await getRolePermissionsStatement.get(user?.role || 'employee')
  return mapPermissionsRow(row)
}

export const requirePermission = async (req, res, key) => {
  const user = await requireUser(req, res)
  if (!user) return null

  const permissions = await getUserPermissions(user)
  if (!permissions[key]) {
    forbidden(res)
    return null
  }

  return { user, permissions }
}

export const normalizeRole = (value) => {
  const role = String(value || '').toLowerCase().trim()
  if (!role) return 'employee'
  if (role === 'owner') return 'admin'
  if (role === 'chef') return 'chef'
  if (role === 'admin') return 'admin'
  return 'employee'
}
