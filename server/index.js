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
const MAX_UPLOAD_BODY_SIZE = 12 * 1024 * 1024
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

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
const allowedAttachmentMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const allowedAttachmentExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
])

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
const listUsersForMessengerStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  ORDER BY name COLLATE NOCASE ASC, email ASC
`)
const getConversationByDirectKeyStatement = db.prepare(
  'SELECT id, type, title, direct_key, created_by, created_at, updated_at FROM conversations WHERE direct_key = ?',
)
const getConversationByIdStatement = db.prepare(
  'SELECT id, type, title, direct_key, created_by, created_at, updated_at FROM conversations WHERE id = ?',
)
const createConversationStatement = db.prepare(`
  INSERT INTO conversations(type, title, direct_key, created_by, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`)
const addConversationMemberStatement = db.prepare(`
  INSERT OR IGNORE INTO conversation_members(conversation_id, user_id)
  VALUES (?, ?)
`)
const isConversationMemberStatement = db.prepare(`
  SELECT 1 AS ok
  FROM conversation_members
  WHERE conversation_id = ? AND user_id = ?
`)
const listUserConversationsStatement = db.prepare(`
  SELECT
    c.id,
    c.type,
    c.title,
    c.direct_key,
    c.created_at,
    c.updated_at,
    lm.id AS last_message_id,
    lm.body AS last_message_body,
    lm.created_at AS last_message_created_at,
    sender.id AS last_sender_id,
    sender.name AS last_sender_name
  FROM conversations c
  JOIN conversation_members cm ON cm.conversation_id = c.id
  LEFT JOIN messages lm ON lm.id = (
    SELECT m.id
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  )
  LEFT JOIN users sender ON sender.id = lm.sender_user_id
  WHERE cm.user_id = ?
  ORDER BY c.updated_at DESC, c.id DESC
`)
const listConversationMembersStatement = db.prepare(`
  SELECT u.id, u.email, u.name, u.role
  FROM conversation_members cm
  JOIN users u ON u.id = cm.user_id
  WHERE cm.conversation_id = ?
  ORDER BY u.name COLLATE NOCASE ASC
`)
const listMessagesStatement = db.prepare(`
  SELECT
    m.id,
    m.conversation_id,
    m.sender_user_id,
    m.body,
    m.created_at,
    u.name AS sender_name,
    u.email AS sender_email
  FROM messages m
  LEFT JOIN users u ON u.id = m.sender_user_id
  WHERE m.conversation_id = ?
    AND m.id IN (
      SELECT id
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    )
  ORDER BY m.created_at ASC, m.id ASC
`)
const getMessageByIdStatement = db.prepare(`
  SELECT
    m.id,
    m.conversation_id,
    m.sender_user_id,
    m.body,
    m.created_at,
    u.name AS sender_name,
    u.email AS sender_email
  FROM messages m
  LEFT JOIN users u ON u.id = m.sender_user_id
  WHERE m.id = ?
`)
const listAttachmentsForConversationStatement = db.prepare(`
  SELECT
    ma.id,
    ma.message_id,
    ma.original_name,
    ma.stored_name,
    ma.mime_type,
    ma.size,
    ma.created_at
  FROM message_attachments ma
  JOIN messages m ON m.id = ma.message_id
  WHERE m.conversation_id = ?
`)
const listAttachmentsForMessageStatement = db.prepare(`
  SELECT
    id,
    message_id,
    original_name,
    stored_name,
    mime_type,
    size,
    created_at
  FROM message_attachments
  WHERE message_id = ?
`)
const insertMessageStatement = db.prepare(`
  INSERT INTO messages(conversation_id, sender_user_id, body)
  VALUES (?, ?, ?)
`)
const insertAttachmentStatement = db.prepare(`
  INSERT INTO message_attachments(
    message_id,
    original_name,
    stored_name,
    mime_type,
    size,
    storage_path
  )
  VALUES (?, ?, ?, ?, ?, ?)
`)
const updateConversationTimestampStatement = db.prepare(
  "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
)
const getAttachmentByIdStatement = db.prepare(`
  SELECT
    ma.id,
    ma.message_id,
    ma.original_name,
    ma.stored_name,
    ma.mime_type,
    ma.size,
    ma.storage_path,
    m.conversation_id
  FROM message_attachments ma
  JOIN messages m ON m.id = ma.message_id
  WHERE ma.id = ?
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

const readBufferBody = (req, maxSize = MAX_UPLOAD_BODY_SIZE) =>
  new Promise((resolve, reject) => {
    let total = 0
    const chunks = []

    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxSize) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', reject)
  })

const parseContentDisposition = (value) => {
  const result = {}
  String(value || '')
    .split(';')
    .map((part) => part.trim())
    .forEach((part) => {
      const [key, ...rest] = part.split('=')
      if (!key || rest.length === 0) return
      result[key.toLowerCase()] = rest.join('=').replace(/^"|"$/g, '')
    })
  return result
}

const parseMultipartBody = async (req) => {
  const contentType = String(req.headers['content-type'] || '')
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) throw new Error('Missing multipart boundary')

  const body = await readBufferBody(req)
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const fieldMap = {}
  const files = []
  let cursor = body.indexOf(boundaryBuffer)

  while (cursor >= 0) {
    cursor += boundaryBuffer.length
    const marker = body.subarray(cursor, cursor + 2).toString('utf8')
    if (marker === '--') break
    if (marker === '\r\n') cursor += 2

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor)
    if (headerEnd < 0) break

    const rawHeaders = body.subarray(cursor, headerEnd).toString('utf8')
    const headers = rawHeaders.split('\r\n').reduce((acc, line) => {
      const separator = line.indexOf(':')
      if (separator < 0) return acc
      acc[line.slice(0, separator).trim().toLowerCase()] = line
        .slice(separator + 1)
        .trim()
      return acc
    }, {})

    const nextBoundary = body.indexOf(boundaryBuffer, headerEnd + 4)
    if (nextBoundary < 0) break

    let content = body.subarray(headerEnd + 4, nextBoundary)
    if (content.length >= 2 && content.subarray(content.length - 2).toString('utf8') === '\r\n') {
      content = content.subarray(0, content.length - 2)
    }

    const disposition = parseContentDisposition(headers['content-disposition'])
    if (disposition.filename) {
      files.push({
        fieldName: disposition.name || 'attachment',
        originalName: disposition.filename,
        mimeType: headers['content-type'] || 'application/octet-stream',
        buffer: content,
      })
    } else if (disposition.name) {
      fieldMap[disposition.name] = content.toString('utf8')
    }

    cursor = nextBoundary
  }

  return { fields: fieldMap, files }
}

const sanitizeUploadName = (value) => {
  const fallback = 'file'
  return (
    path
      .basename(String(value || fallback))
      .replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_')
      .trim() || fallback
  )
}

const extensionForMimeType = (mimeType) => {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'text/plain') return '.txt'
  if (mimeType.includes('wordprocessingml')) return '.docx'
  if (mimeType.includes('spreadsheetml')) return '.xlsx'
  if (mimeType === 'application/msword') return '.doc'
  if (mimeType === 'application/vnd.ms-excel') return '.xls'
  return ''
}

const mimeTypeForExtension = (extension) => {
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.txt') return 'text/plain'
  if (extension === '.doc') return 'application/msword'
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (extension === '.xls') return 'application/vnd.ms-excel'
  if (extension === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return ''
}

const prepareAttachmentUpload = (file) => {
  if (!file || file.buffer.length === 0) return null
  if (file.buffer.length > MAX_ATTACHMENT_SIZE) {
    throw new Error('Файл больше 10 МБ')
  }

  const originalName = sanitizeUploadName(file.originalName)
  const originalExt = path.extname(originalName).toLowerCase().slice(0, 12)
  const rawMimeType = String(file.mimeType || '').toLowerCase()
  const mimeType = rawMimeType || 'application/octet-stream'
  const genericMimeType = mimeType === 'application/octet-stream'
  const allowedByMime = allowedAttachmentMimeTypes.has(mimeType)
  const allowedByExtension =
    genericMimeType && allowedAttachmentExtensions.has(originalExt)

  if (!allowedByMime && !allowedByExtension) {
    throw new Error('Этот тип файла пока нельзя отправить')
  }

  const normalizedMimeType = allowedByMime
    ? mimeType
    : mimeTypeForExtension(originalExt) || 'application/octet-stream'
  const safeOriginalExt = allowedAttachmentExtensions.has(originalExt) ? originalExt : ''
  const extension = safeOriginalExt || extensionForMimeType(normalizedMimeType)
  const storedName = `${randomBytes(16).toString('hex')}${extension}`
  const storagePath = storedName

  return {
    originalName,
    storedName,
    mimeType: normalizedMimeType,
    size: file.buffer.length,
    storagePath,
    buffer: file.buffer,
  }
}

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

const parseConversationMessagesPath = (pathname) => {
  const match = pathname.match(/^\/api\/messenger\/conversations\/(\d+)\/messages$/)
  if (!match) return null
  return Number(match[1])
}

const parseConversationMembersPath = (pathname) => {
  const match = pathname.match(/^\/api\/messenger\/conversations\/(\d+)\/members$/)
  if (!match) return null
  return Number(match[1])
}

const parseAttachmentPath = (pathname) => {
  const match = pathname.match(/^\/api\/messenger\/attachments\/(\d+)$/)
  if (!match) return null
  return Number(match[1])
}

const makeDirectConversationKey = (firstUserId, secondUserId) => {
  const ids = [Number(firstUserId), Number(secondUserId)].sort((a, b) => a - b)
  return `${ids[0]}:${ids[1]}`
}

const normalizeGroupTitle = (value) => String(value || '').trim().slice(0, 80)

const normalizeMemberIds = (value, currentUserId) => {
  const source = Array.isArray(value) ? value : []
  const ids = new Set()

  for (const item of source) {
    const id = Number(item)
    if (!Number.isFinite(id) || id <= 0 || id === currentUserId) continue
    ids.add(id)
  }

  return [...ids].slice(0, 50)
}

const mapMessengerUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  created_at: row.created_at,
})

const conversationToDto = (row, currentUser) => {
  const members = listConversationMembersStatement.all(row.id).map(mapMessengerUser)
  const otherMember = members.find((member) => member.id !== currentUser.id) || members[0]
  const displayTitle =
    row.type === 'direct'
      ? otherMember?.name || otherMember?.email || 'Диалог'
      : row.title || 'Диалог'

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    displayTitle,
    direct_key: row.direct_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    members,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          body: row.last_message_body,
          created_at: row.last_message_created_at,
          sender: {
            id: row.last_sender_id,
            name: row.last_sender_name,
          },
        }
      : null,
  }
}

const attachmentToDto = (row) => ({
  id: row.id,
  message_id: row.message_id,
  original_name: row.original_name,
  mime_type: row.mime_type,
  size: row.size,
  created_at: row.created_at,
  url: `/api/messenger/attachments/${row.id}`,
})

const messageToDto = (row, attachments = []) => ({
  id: row.id,
  conversation_id: row.conversation_id,
  sender_user_id: row.sender_user_id,
  sender_name: row.sender_name || row.sender_email || 'Пользователь',
  sender_email: row.sender_email,
  body: row.body || '',
  created_at: row.created_at,
  attachments: attachments.map(attachmentToDto),
})

const listMessageDtos = (conversationId, limit) => {
  const messageRows = listMessagesStatement.all(conversationId, conversationId, limit)
  const attachmentsByMessage = new Map()

  for (const attachment of listAttachmentsForConversationStatement.all(conversationId)) {
    const list = attachmentsByMessage.get(attachment.message_id) || []
    list.push(attachment)
    attachmentsByMessage.set(attachment.message_id, list)
  }

  return messageRows.map((row) =>
    messageToDto(row, attachmentsByMessage.get(row.id) || []),
  )
}

const ensureConversationMember = (conversationId, user, res) => {
  const conversation = getConversationByIdStatement.get(conversationId)
  if (!conversation) {
    notFound(res, 'Диалог не найден')
    return null
  }

  const member = isConversationMemberStatement.get(conversationId, user.id)
  if (!member) {
    forbidden(res, 'У вас нет доступа к этому диалогу')
    return null
  }

  return conversation
}

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

    if (pathname === '/api/messenger/users' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const users = listUsersForMessengerStatement
        .all()
        .filter((row) => row.id !== user.id)
        .map(mapMessengerUser)

      json(res, 200, { users })
      return
    }

    if (pathname === '/api/messenger/conversations' && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const conversations = listUserConversationsStatement
        .all(user.id)
        .map((row) => conversationToDto(row, user))

      json(res, 200, { conversations })
      return
    }

    if (pathname === '/api/messenger/conversations/direct' && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const targetUserId = Number(body.userId)
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
        badRequest(res, 'Выберите пользователя')
        return
      }
      if (targetUserId === user.id) {
        badRequest(res, 'Нельзя создать диалог с самим собой')
        return
      }

      const targetUser = getUserByIdStatement.get(targetUserId)
      if (!targetUser) {
        notFound(res, 'Пользователь не найден')
        return
      }

      const directKey = makeDirectConversationKey(user.id, targetUserId)
      let conversation = getConversationByDirectKeyStatement.get(directKey)

      if (!conversation) {
        db.exec('BEGIN')
        try {
          const result = createConversationStatement.run(
            'direct',
            null,
            directKey,
            user.id,
          )
          const conversationId = Number(result.lastInsertRowid)
          addConversationMemberStatement.run(conversationId, user.id)
          addConversationMemberStatement.run(conversationId, targetUserId)
          db.exec('COMMIT')
          conversation = getConversationByIdStatement.get(conversationId)
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }

      json(res, 200, { conversation: conversationToDto(conversation, user) })
      return
    }

    if (pathname === '/api/messenger/conversations/group' && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const title = normalizeGroupTitle(body.title)
      const memberIds = normalizeMemberIds(body.memberIds, user.id)

      if (!title) {
        badRequest(res, 'Укажите название группы')
        return
      }
      if (memberIds.length === 0) {
        badRequest(res, 'Добавьте хотя бы одного участника')
        return
      }

      for (const memberId of memberIds) {
        const member = getUserByIdStatement.get(memberId)
        if (!member) {
          badRequest(res, 'В списке есть пользователь, которого уже нет')
          return
        }
      }

      let conversationId = null
      db.exec('BEGIN')
      try {
        const result = createConversationStatement.run('group', title, null, user.id)
        conversationId = Number(result.lastInsertRowid)
        addConversationMemberStatement.run(conversationId, user.id)
        for (const memberId of memberIds) {
          addConversationMemberStatement.run(conversationId, memberId)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      const conversation = getConversationByIdStatement.get(conversationId)
      json(res, 201, { conversation: conversationToDto(conversation, user) })
      return
    }

    const messengerMembersConversationId = parseConversationMembersPath(pathname)
    if (messengerMembersConversationId && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return

      const conversation = ensureConversationMember(messengerMembersConversationId, user, res)
      if (!conversation) return
      if (conversation.type !== 'group') {
        badRequest(res, 'Участников можно добавлять только в группу')
        return
      }

      const body = await readJsonBody(req)
      const memberIds = normalizeMemberIds(body.memberIds, user.id)
      if (memberIds.length === 0) {
        badRequest(res, 'Выберите участников')
        return
      }

      for (const memberId of memberIds) {
        const member = getUserByIdStatement.get(memberId)
        if (!member) {
          badRequest(res, 'В списке есть пользователь, которого уже нет')
          return
        }
      }

      db.exec('BEGIN')
      try {
        for (const memberId of memberIds) {
          addConversationMemberStatement.run(messengerMembersConversationId, memberId)
        }
        updateConversationTimestampStatement.run(messengerMembersConversationId)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }

      const updatedConversation = getConversationByIdStatement.get(
        messengerMembersConversationId,
      )
      json(res, 200, { conversation: conversationToDto(updatedConversation, user) })
      return
    }

    const messengerConversationId = parseConversationMessagesPath(pathname)
    if (messengerConversationId && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return
      const conversation = ensureConversationMember(messengerConversationId, user, res)
      if (!conversation) return

      const limit = Math.max(
        1,
        Math.min(200, parseInteger(requestUrl.searchParams.get('limit'), 100)),
      )
      json(res, 200, {
        conversation: conversationToDto(conversation, user),
        messages: listMessageDtos(messengerConversationId, limit),
      })
      return
    }

    if (messengerConversationId && req.method === 'POST') {
      const user = requireUser(req, res)
      if (!user) return
      const conversation = ensureConversationMember(messengerConversationId, user, res)
      if (!conversation) return

      const contentType = String(req.headers['content-type'] || '').toLowerCase()
      let bodyText = ''
      let attachment = null

      if (contentType.includes('multipart/form-data')) {
        let parsed
        try {
          parsed = await parseMultipartBody(req)
        } catch (error) {
          badRequest(res, error?.message || 'Не удалось прочитать файл')
          return
        }

        bodyText = parsed.fields.body || ''
        const rawFile =
          parsed.files.find((file) => file.fieldName === 'attachment') ||
          parsed.files[0]

        try {
          attachment = prepareAttachmentUpload(rawFile)
        } catch (error) {
          badRequest(res, error?.message || 'Не удалось подготовить файл')
          return
        }
      } else {
        const body = await readJsonBody(req)
        bodyText = body.body || ''
      }

      const messageBody = String(bodyText || '').trim()
      if (!messageBody && !attachment) {
        badRequest(res, 'Напишите сообщение или прикрепите файл')
        return
      }

      let savedFilePath = null
      let messageId = null
      db.exec('BEGIN')
      try {
        const result = insertMessageStatement.run(
          messengerConversationId,
          user.id,
          messageBody || null,
        )
        messageId = Number(result.lastInsertRowid)

        if (attachment) {
          savedFilePath = path.join(uploadsDir, attachment.storagePath)
          fs.writeFileSync(savedFilePath, attachment.buffer, { flag: 'wx' })
          insertAttachmentStatement.run(
            messageId,
            attachment.originalName,
            attachment.storedName,
            attachment.mimeType,
            attachment.size,
            attachment.storagePath,
          )
        }

        updateConversationTimestampStatement.run(messengerConversationId)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        if (savedFilePath) {
          fs.rmSync(savedFilePath, { force: true })
        }
        throw error
      }

      const messageRow = getMessageByIdStatement.get(messageId)
      const attachments = listAttachmentsForMessageStatement.all(messageId)

      json(res, 201, {
        conversation: conversationToDto(getConversationByIdStatement.get(messengerConversationId), user),
        message: messageToDto(messageRow, attachments),
      })
      return
    }

    const attachmentId = parseAttachmentPath(pathname)
    if (attachmentId && req.method === 'GET') {
      const user = requireUser(req, res)
      if (!user) return

      const attachment = getAttachmentByIdStatement.get(attachmentId)
      if (!attachment) {
        notFound(res, 'Файл не найден')
        return
      }

      const conversation = ensureConversationMember(attachment.conversation_id, user, res)
      if (!conversation) return

      const filePath = path.resolve(uploadsDir, attachment.storage_path)
      const safeRoot = `${uploadsDir}${path.sep}`
      if (!filePath.startsWith(safeRoot)) {
        forbidden(res)
        return
      }
      if (!fs.existsSync(filePath)) {
        notFound(res, 'Файл не найден на диске')
        return
      }

      const stat = fs.statSync(filePath)
      const fallbackName = sanitizeUploadName(attachment.original_name)
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/"/g, '')
      res.writeHead(200, {
        'Content-Type': attachment.mime_type || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,
        'Cache-Control': 'private, no-store',
      })
      fs.createReadStream(filePath).pipe(res)
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
    const cacheControl =
      outputPath.endsWith('index.html') ||
      outputPath.endsWith('sw.js') ||
      outputPath.endsWith('app-version.json') ||
      outputPath.endsWith('manifest.webmanifest')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable'

    const data = fs.readFileSync(outputPath)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': cacheControl,
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
