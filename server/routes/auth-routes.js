import {
  clearSessionCookie,
  createSession,
  getCurrentUser,
  getUserPermissions,
  hashPassword,
  isSuperAdminUser,
  requireUser,
  sanitizeUser,
  setSessionCookie,
  SESSION_COOKIE,
  verifyPassword,
} from '../auth.js'
import { badRequest, json, parseCookies, readJsonBody, unauthorized } from '../http.js'
import {
  createUserStatement,
  deleteSessionStatement,
  getUserByEmailStatement,
  getUserByIdStatement,
  getUsersCountStatement,
} from '../statements.js'

export const handleAuthRoutes = async ({ req, res, pathname, adminEmails }) => {
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const displayName = String(body.displayName || body.name || '').trim()

    if (!email || !email.includes('@')) {
      badRequest(res, 'Укажите корректный email')
      return true
    }
    if (password.length < 6) {
      badRequest(res, 'Пароль должен быть не короче 6 символов')
      return true
    }

    const existing = await getUserByEmailStatement.get(email)
    if (existing) {
      json(res, 409, { error: 'Пользователь с таким email уже существует' })
      return true
    }

    const usersCount = (await getUsersCountStatement.get()).count
    const role = usersCount === 0 || adminEmails.has(email) ? 'admin' : 'employee'

    const name = displayName || email.split('@')[0] || 'Сотрудник'
    const passwordHash = hashPassword(password)
    const insertResult = await createUserStatement.run(email, passwordHash, name, role)
    const userId = Number(insertResult.lastInsertRowid)
    const user = await getUserByIdStatement.get(userId)

    const sessionId = await createSession(userId)
    setSessionCookie(res, sessionId)
    json(res, 201, { user: sanitizeUser(user) })
    return true
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    const user = await getUserByEmailStatement.get(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      unauthorized(res, 'Неверный email или пароль')
      return true
    }

    const sessionId = await createSession(user.id)
    setSessionCookie(res, sessionId)
    json(res, 200, { user: sanitizeUser(user) })
    return true
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req)
    const sessionId = cookies[SESSION_COOKIE]
    if (sessionId) {
      await deleteSessionStatement.run(sessionId)
    }
    clearSessionCookie(res)
    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await getCurrentUser(req)
    json(res, 200, { user })
    return true
  }

  if (pathname === '/api/auth/permissions' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true
    json(res, 200, {
      permissions: await getUserPermissions(user),
      isSuperAdmin: isSuperAdminUser(user),
    })
    return true
  }

  return false
}
