import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {
  clearSessionCookie,
  createSession,
  getCurrentUser,
  getUserPermissions,
  hashPassword,
  isSuperAdminEmail,
  isSuperAdminUser,
  mapPermissionsRow,
  normalizeRole,
  requirePermission,
  requireUser,
  sanitizeUser,
  setSessionCookie,
  SUPER_ADMIN_EMAIL,
  toBoolInt,
  verifyPassword,
} from './auth.js'
import { db, dbPath } from './db.js'
import { logAudit, parseAuditJson, touchResource } from './audit.js'
import {
  badRequest,
  forbidden,
  json,
  noContent,
  notFound,
  readJsonBody,
  withErrorHandling,
} from './http.js'
import {
  parseMultipartBody as parseMultipartRequestBody,
  prepareAttachmentUpload as prepareAttachmentUploadFile,
  sanitizeUploadName,
} from './uploads.js'
import { createStaticFileServer } from './static.js'
import {
  buildPushPayload,
  ensureNotificationSettings,
  notifyUserByName,
  notifyUsers,
  pushConfig,
  startReminderLoop,
  stopReminderLoop,
} from './notifications.js'
import {
  buildMessagePreview,
  conversationToDto,
  ensureConversationMember,
  listMessageDtos,
  makeDirectConversationKey,
  mapMessengerUser,
  messageToDto,
  normalizeGroupTitle,
  normalizeMemberIds,
  normalizePersonName,
} from './messenger.js'
import {
  getUsersCountStatement,
  getUserByEmailStatement,
  getUserByIdStatement,
  listUsersForRoleManageStatement,
  listUsersWithScheduleManageStatement,
  updateUserRoleStatement,
  createUserStatement,
  createSessionStatement,
  getSessionUserStatement,
  deleteSessionStatement,
  deleteExpiredSessionsStatement,
  listProductsStatement,
  getProductByIdStatement,
  insertProductStatement,
  updateProductStatement,
  deleteProductStatement,
  getRolePermissionsStatement,
  listRolePermissionsStatement,
  upsertRolePermissionsStatement,
  listTodayRecordsStatement,
  deleteTodayRecordsStatement,
  insertDailyRecordStatement,
  listArchiveRecordsStatement,
  listUpcomingShiftsStatement,
  listAllShiftsStatement,
  getShiftByIdStatement,
  insertShiftStatement,
  updateShiftEmployeeStatement,
  updateShiftStatusStatement,
  updateShiftDetailsStatement,
  upsertNotificationSettingsStatement,
  upsertPushSubscriptionStatement,
  deletePushSubscriptionStatement,
  deleteShiftStatement,
  upsertEditingPresenceStatement,
  removeEditingPresenceStatement,
  listEditingPresenceStatement,
  getResourceStateStatement,
  listAuditLogStatement,
  listUsersForMessengerStatement,
  getConversationByDirectKeyStatement,
  getConversationByIdStatement,
  createConversationStatement,
  addConversationMemberStatement,
  listUserConversationsStatement,
  listConversationMembersStatement,
  getMessageByIdStatement,
  listAttachmentsForMessageStatement,
  insertMessageStatement,
  insertAttachmentStatement,
  updateConversationTimestampStatement,
  getAttachmentByIdStatement,
} from './statements.js'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 8787)
const MAX_BODY_SIZE = 1024 * 1024
const MAX_UPLOAD_BODY_SIZE = 12 * 1024 * 1024
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)

const distDir = path.resolve(process.cwd(), 'dist')
const serveStaticFile = createStaticFileServer({ distDir, json })

const toShiftDto = (row) => ({
  id: row.id,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
  employee_name: row.employee_name,
  status: row.status || 'approved',
})

const getToday = () => new Date().toISOString().slice(0, 10)
const getCurrentWeekStartDate = () => {
  const today = new Date()
  const day = today.getDay() || 7
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(today.getDate() - (day - 1))
  return monday.toISOString().slice(0, 10)
}
const isValidShiftRange = (startTime, endTime) =>
  Boolean(startTime && endTime && startTime < endTime)
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

const parseInteger = (value, fallback) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

const normalizeProductCategory = (value) => {
  const category = String(value || '').trim().toLowerCase()
  if (category === 'bakery' || category === 'pastry' || category === 'other') {
    return category
  }
  return 'other'
}

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

      const existing = await getUserByEmailStatement.get(email)
      if (existing) {
        json(res, 409, { error: 'Пользователь с таким email уже существует' })
        return
      }

      const usersCount = (await getUsersCountStatement.get()).count
      const role =
        usersCount === 0 || adminEmails.has(email)
          ? 'admin'
          : normalizeRole(body.role)

      const name = displayName || email.split('@')[0] || 'Сотрудник'
      const passwordHash = hashPassword(password)
      const insertResult = await createUserStatement.run(email, passwordHash, name, role)
      const userId = Number(insertResult.lastInsertRowid)
      const user = await getUserByIdStatement.get(userId)

      const sessionId = await createSession(userId)
      setSessionCookie(res, sessionId)
      json(res, 201, { user: sanitizeUser(user) })
      return
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')

      const user = await getUserByEmailStatement.get(email)
      if (!user || !verifyPassword(password, user.password_hash)) {
        unauthorized(res, 'Неверный email или пароль')
        return
      }

      const sessionId = await createSession(user.id)
      setSessionCookie(res, sessionId)
      json(res, 200, { user: sanitizeUser(user) })
      return
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req)
      const sessionId = cookies[SESSION_COOKIE]
      if (sessionId) {
        await deleteSessionStatement.run(sessionId)
      }
      clearSessionCookie(res)
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await getCurrentUser(req)
      json(res, 200, { user })
      return
    }

    if (pathname === '/api/auth/permissions' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return
      json(res, 200, {
        permissions: await getUserPermissions(user),
        isSuperAdmin: isSuperAdminUser(user),
      })
      return
    }

    if (pathname === '/api/notifications/settings' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      json(res, 200, {
        settings: await ensureNotificationSettings(user.id),
        pushAvailable: pushConfig.enabled,
        publicKey: pushConfig.publicKey,
      })
      return
    }

    if (pathname === '/api/notifications/settings' && req.method === 'PUT') {
      const user = await requireUser(req, res)
      if (!user) return

      const current = await ensureNotificationSettings(user.id)
      const body = await readJsonBody(req)
      const next = {
        push_enabled: body.push_enabled ?? current.push_enabled,
        messages_enabled: body.messages_enabled ?? current.messages_enabled,
        shifts_enabled: body.shifts_enabled ?? current.shifts_enabled,
        reminders_enabled: body.reminders_enabled ?? current.reminders_enabled,
      }

      await upsertNotificationSettingsStatement.run(
        user.id,
        toBoolInt(next.push_enabled, 1),
        toBoolInt(next.messages_enabled, 1),
        toBoolInt(next.shifts_enabled, 1),
        toBoolInt(next.reminders_enabled, 1),
      )

      json(res, 200, {
        settings: await ensureNotificationSettings(user.id),
        pushAvailable: pushConfig.enabled,
        publicKey: pushConfig.publicKey,
      })
      return
    }

    if (pathname === '/api/notifications/subscriptions' && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const subscription = body.subscription || {}
      const endpoint = String(subscription.endpoint || '').trim()
      const p256dh = String(subscription.keys?.p256dh || '').trim()
      const authKey = String(subscription.keys?.auth || '').trim()
      const userAgent = String(body.userAgent || '').trim().slice(0, 500)

      if (!endpoint || !p256dh || !authKey) {
        badRequest(res, 'Некорректная push-подписка')
        return
      }

      await upsertPushSubscriptionStatement.run(
        user.id,
        endpoint,
        p256dh,
        authKey,
        userAgent || null,
      )
      await ensureNotificationSettings(user.id)

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/notifications/subscriptions' && req.method === 'DELETE') {
      const user = await requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const endpoint = String(body.endpoint || '').trim()
      if (!endpoint) {
        badRequest(res, 'Не передан endpoint подписки')
        return
      }

      await deletePushSubscriptionStatement.run(endpoint)
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/notifications/test' && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      await notifyUsers(
        [user.id],
        'messages',
        buildPushPayload({
          title: 'Тест уведомлений',
          body: 'Push-уведомления работают на этом устройстве',
          url: '/profile',
          tag: `push-test-${user.id}`,
        }),
      )

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const products = await listProductsStatement.all()
      json(res, 200, { products })
      return
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      const access = await requirePermission(req, res, 'productsManage')
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

      const result = await insertProductStatement.run(name, category, unit)
      const product = await getProductByIdStatement.get(Number(result.lastInsertRowid))
      await touchResource('assortment', user)
      await logAudit({
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
      const access = await requirePermission(req, res, 'productsManage')
      if (!access) return
      const { user } = access

      const existing = await getProductByIdStatement.get(productId)
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

      await updateProductStatement.run(name, category, unit, productId)
      const product = await getProductByIdStatement.get(productId)
      await touchResource('assortment', user)
      await logAudit({
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
      const access = await requirePermission(req, res, 'productsManage')
      if (!access) return
      const { user } = access

      const existing = await getProductByIdStatement.get(productId)
      if (!existing) {
        notFound(res, 'Товар не найден')
        return
      }

      await deleteProductStatement.run(productId)
      await touchResource('assortment', user)
      await logAudit({
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
      const user = await requireUser(req, res)
      if (!user) return

      const today = getToday()
      const rows = await listTodayRecordsStatement.all(today)
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
      const access = await requirePermission(req, res, 'reportEdit')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const entries = Array.isArray(body.entries) ? body.entries : []
      const today = getToday()

      await db.transaction(async (client) => {
        await deleteTodayRecordsStatement.runOn(client, today)

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

          await insertDailyRecordStatement.runOn(
            client,
            today,
            productId,
            normalizedArrival,
            normalizedRemainder,
            normalizedWriteOff,
            user.id,
          )
        }
      })

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/archive/records' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const rows = await listArchiveRecordsStatement.all()
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
      const user = await requireUser(req, res)
      if (!user) return

      const rows = await listUpcomingShiftsStatement.all(getCurrentWeekStartDate())
      json(res, 200, { shifts: rows.map(toShiftDto) })
      return
    }

    if (pathname === '/api/shifts/archive' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const rows = await listAllShiftsStatement.all()
      json(res, 200, { shifts: rows.map(toShiftDto) })
      return
    }

    if (pathname === '/api/shifts/help-request' && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const date = String(body.date || '')
      const startTime = String(body.start_time || '')
      const endTime = String(body.end_time || '')

      if (!date || !startTime || !endTime) {
        badRequest(res, 'Заполните дату и время')
        return
      }

      if (!isValidShiftRange(startTime, endTime)) {
        badRequest(res, 'Время окончания должно быть позже начала')
        return
      }

      const result = await insertShiftStatement.run(
        date,
        startTime,
        endTime,
        user.name,
        'pending',
        user.id,
      )
      await touchResource('schedule', user)
      await logAudit({
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

      const scheduleManagers = (await listUsersWithScheduleManageStatement.all())
        .map((row) => row.id)
        .filter((id) => id !== user.id)
      await notifyUsers(
        scheduleManagers,
        'shifts',
        buildPushPayload({
          title: 'Новая заявка на смену',
          body: `${user.name}: ${date} ${startTime}-${endTime}`,
          url: '/schedule',
          tag: `shift-help-request-${Number(result.lastInsertRowid)}`,
          urgency: 'high',
        }),
      )

      json(res, 201, { id: Number(result.lastInsertRowid) })
      return
    }

    if (pathname === '/api/shifts/admin-create' && req.method === 'POST') {
      const access = await requirePermission(req, res, 'scheduleManage')
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

      if (!isValidShiftRange(startTime, endTime)) {
        badRequest(res, 'Время окончания должно быть позже начала')
        return
      }

      const result = await insertShiftStatement.run(
        date,
        startTime,
        endTime,
        null,
        'approved',
        user.id,
      )
      await touchResource('schedule', user)
      await logAudit({
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
      const access = await requirePermission(req, res, 'scheduleManage')
      if (!access) return
      const { user } = access

      const body = await readJsonBody(req)
      const deletedIds = Array.isArray(body.deletedIds) ? body.deletedIds : []
      const newShifts = Array.isArray(body.newShifts) ? body.newShifts : []

      const { deletedSnapshot, createdIds } = await db.transaction(async (client) => {
        const deletedSnapshot = []
        for (const id of deletedIds) {
          const shiftId = Number(id)
          if (!Number.isFinite(shiftId)) continue
          const existingShift = await getShiftByIdStatement.getOn(client, shiftId)
          if (existingShift) deletedSnapshot.push(existingShift)
          await deleteShiftStatement.runOn(client, shiftId)
        }

        const createdIds = []
        for (const shift of newShifts) {
          const date = String(shift.date || '')
          const startTime = String(shift.start_time || '')
          const endTime = String(shift.end_time || '')
          if (!date || !startTime || !endTime) continue
          if (!isValidShiftRange(startTime, endTime)) continue

          const result = await insertShiftStatement.runOn(
            client,
            date,
            startTime,
            endTime,
            null,
            'approved',
            user.id,
          )
          createdIds.push(Number(result.lastInsertRowid))
        }

        return { deletedSnapshot, createdIds }
      })

      await touchResource('schedule', user)
      if (deletedSnapshot.length > 0 || createdIds.length > 0) {
        await logAudit({
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

      json(res, 200, { ok: true })
      return
    }

    const shiftAction = parseShiftId(pathname)
    if (shiftAction) {
      const authUser = await requireUser(req, res)
      if (!authUser) return

      const shift = await getShiftByIdStatement.get(shiftAction.id)
      if (!shift) {
        notFound(res, 'Смена не найдена')
        return
      }

      if (req.method === 'PATCH' && shiftAction.action === 'book') {
        if (shift.employee_name) {
          badRequest(res, 'Смена уже занята')
          return
        }

        await updateShiftEmployeeStatement.run(authUser.name, shiftAction.id)
        await touchResource('schedule', authUser)
        await logAudit({
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

      if (req.method === 'PATCH' && !shiftAction.action) {
        const authPermissions = await getUserPermissions(authUser)
        if (!authPermissions.scheduleManage) {
          forbidden(res)
          return
        }

        const body = await readJsonBody(req)
        const date = String(body.date || '')
        const startTime = String(body.start_time || '')
        const endTime = String(body.end_time || '')

        if (!date || !startTime || !endTime) {
          badRequest(res, 'Заполните дату и время')
          return
        }

        if (!isValidShiftRange(startTime, endTime)) {
          badRequest(res, 'Время окончания должно быть позже начала')
          return
        }

        await updateShiftDetailsStatement.run(date, startTime, endTime, shiftAction.id)
        await touchResource('schedule', authUser)
        await logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.update',
          before: shift,
          after: { ...shift, date, start_time: startTime, end_time: endTime },
        })
        if (
          shift.employee_name &&
          normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
        ) {
          await notifyUserByName(
            shift.employee_name,
            'shifts',
            buildPushPayload({
              title: 'Смена изменена',
              body: `Новая дата или время: ${date} ${startTime}-${endTime}`,
              url: '/schedule',
              tag: `shift-updated-${shiftAction.id}`,
              urgency: 'high',
            }),
          )
        }
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'PATCH' && shiftAction.action === 'unbook') {
        const authPermissions = await getUserPermissions(authUser)
        if (
          !authPermissions.scheduleManage &&
          normalizePersonName(shift.employee_name) !== normalizePersonName(authUser.name)
        ) {
          forbidden(res)
          return
        }

        await updateShiftEmployeeStatement.run(null, shiftAction.id)
        await touchResource('schedule', authUser)
        await logAudit({
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
        const authPermissions = await getUserPermissions(authUser)
        if (!authPermissions.scheduleManage) {
          forbidden(res)
          return
        }

        await updateShiftStatusStatement.run('approved', shiftAction.id)
        await touchResource('schedule', authUser)
        await logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.approve',
          before: shift,
          after: { ...shift, status: 'approved' },
        })
        if (shift.created_by) {
          await notifyUsers(
            [shift.created_by],
            'shifts',
            buildPushPayload({
              title: 'Заявка на смену подтверждена',
              body: `${shift.date} ${shift.start_time}-${shift.end_time}`,
              url: '/schedule',
              tag: `shift-approved-${shiftAction.id}`,
              urgency: 'high',
            }),
          )
        }
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'DELETE' && !shiftAction.action) {
        const authPermissions = await getUserPermissions(authUser)
        if (!authPermissions.scheduleManage) {
          forbidden(res)
          return
        }

        await deleteShiftStatement.run(shiftAction.id)
        await touchResource('schedule', authUser)
        await logAudit({
          actorUser: authUser,
          entityType: 'shift',
          entityId: shiftAction.id,
          action: 'shift.delete',
          before: shift,
        })
        if (shift.status === 'pending' && shift.created_by) {
          await notifyUsers(
            [shift.created_by],
            'shifts',
            buildPushPayload({
              title: 'Заявка на смену отклонена',
              body: `${shift.date} ${shift.start_time}-${shift.end_time}`,
              url: '/schedule',
              tag: `shift-rejected-${shiftAction.id}`,
              urgency: 'high',
            }),
          )
        }
        json(res, 200, { ok: true })
        return
      }
    }

    if (pathname === '/api/audit' && req.method === 'GET') {
      const access = await requirePermission(req, res, 'auditView')
      if (!access) return

      const limit = Math.max(1, Math.min(100, parseInteger(requestUrl.searchParams.get('limit'), 50)))
      const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
      const rows = await listAuditLogStatement.all(limit, offset)
      const logs = rows.map((row) => ({
        id: row.id,
        actor_user_id: row.actor_user_id,
        actor_name: row.actor_name,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        before: parseAuditJson(row.before_json),
        after: parseAuditJson(row.after_json),
        context: parseAuditJson(row.context_json),
        created_at: row.created_at,
      }))

      json(res, 200, { logs })
      return
    }

    if (pathname === '/api/editing/heartbeat' && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const resource = String(body.resource || '').trim()
      const active = body.active !== false

      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = await getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      if (active) {
        await upsertEditingPresenceStatement.run(resource, user.id, user.name || user.email)
      } else {
        await removeEditingPresenceStatement.run(resource, user.id)
      }

      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/editing/touch' && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      const body = await readJsonBody(req)
      const resource = String(body.resource || '').trim()

      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = await getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      await touchResource(resource, user)
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/editing/status' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const resource = String(requestUrl.searchParams.get('resource') || '').trim()
      if (!isEditableResource(resource)) {
        badRequest(res, 'Некорректный ресурс')
        return
      }

      const permissions = await getUserPermissions(user)
      if (
        (resource === 'schedule' && !permissions.scheduleManage) ||
        (resource === 'assortment' && !permissions.productsManage)
      ) {
        forbidden(res)
        return
      }

      const activeEditors = (await listEditingPresenceStatement.all(resource))
        .filter((row) => row.user_id !== user.id)
        .map((row) => ({
          user_id: row.user_id,
          user_name: row.user_name,
          updated_at: row.updated_at,
        }))

      const state = await getResourceStateStatement.get(resource)
      json(res, 200, {
        activeEditors,
        lastChangedAt: state?.last_changed_at || null,
        lastChangedBy: state?.last_changed_by || null,
      })
      return
    }

    if (pathname === '/api/messenger/users' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const users = (await listUsersForMessengerStatement.all())
        .filter((row) => row.id !== user.id)
        .map(mapMessengerUser)

      json(res, 200, { users })
      return
    }

    if (pathname === '/api/messenger/conversations' && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const conversations = await Promise.all(
        (await listUserConversationsStatement.all(user.id)).map((row) =>
          conversationToDto(row, user),
        ),
      )

      json(res, 200, { conversations })
      return
    }

    if (pathname === '/api/messenger/conversations/direct' && req.method === 'POST') {
      const user = await requireUser(req, res)
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

      const targetUser = await getUserByIdStatement.get(targetUserId)
      if (!targetUser) {
        notFound(res, 'Пользователь не найден')
        return
      }

      const directKey = makeDirectConversationKey(user.id, targetUserId)
      let conversation = await getConversationByDirectKeyStatement.get(directKey)

      if (!conversation) {
        const conversationId = await db.transaction(async (client) => {
          const result = await createConversationStatement.runOn(
            client,
            'direct',
            null,
            directKey,
            user.id,
          )
          const newConversationId = Number(result.lastInsertRowid)
          await addConversationMemberStatement.runOn(client, newConversationId, user.id)
          await addConversationMemberStatement.runOn(client, newConversationId, targetUserId)
          return newConversationId
        })
        conversation = await getConversationByIdStatement.get(conversationId)
      }

      json(res, 200, { conversation: await conversationToDto(conversation, user) })
      return
    }

    if (pathname === '/api/messenger/conversations/group' && req.method === 'POST') {
      const user = await requireUser(req, res)
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
        const member = await getUserByIdStatement.get(memberId)
        if (!member) {
          badRequest(res, 'В списке есть пользователь, которого уже нет')
          return
        }
      }

      const conversationId = await db.transaction(async (client) => {
        const result = await createConversationStatement.runOn(client, 'group', title, null, user.id)
        const newConversationId = Number(result.lastInsertRowid)
        await addConversationMemberStatement.runOn(client, newConversationId, user.id)
        for (const memberId of memberIds) {
          await addConversationMemberStatement.runOn(client, newConversationId, memberId)
        }
        return newConversationId
      })

      const conversation = await getConversationByIdStatement.get(conversationId)
      await notifyUsers(
        memberIds,
        'messages',
        buildPushPayload({
          title: 'Вас добавили в группу',
          body: `Новый чат: ${title}`,
          url: '/messenger',
          tag: `group-created-${conversationId}`,
        }),
      )
      json(res, 201, { conversation: await conversationToDto(conversation, user) })
      return
    }

    const messengerMembersConversationId = parseConversationMembersPath(pathname)
    if (messengerMembersConversationId && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return

      const conversation = await ensureConversationMember(messengerMembersConversationId, user, res)
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
        const member = await getUserByIdStatement.get(memberId)
        if (!member) {
          badRequest(res, 'В списке есть пользователь, которого уже нет')
          return
        }
      }

      await db.transaction(async (client) => {
        for (const memberId of memberIds) {
          await addConversationMemberStatement.runOn(client, messengerMembersConversationId, memberId)
        }
        await updateConversationTimestampStatement.runOn(client, messengerMembersConversationId)
      })

      const updatedConversation = await getConversationByIdStatement.get(
        messengerMembersConversationId,
      )
      await notifyUsers(
        memberIds,
        'messages',
        buildPushPayload({
          title: 'Вас добавили в группу',
          body: `Чат: ${conversation.title || 'Группа'}`,
          url: '/messenger',
          tag: `group-members-added-${messengerMembersConversationId}`,
        }),
      )
      json(res, 200, { conversation: await conversationToDto(updatedConversation, user) })
      return
    }

    const messengerConversationId = parseConversationMessagesPath(pathname)
    if (messengerConversationId && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return
      const conversation = await ensureConversationMember(messengerConversationId, user, res)
      if (!conversation) return

      const limit = Math.max(
        1,
        Math.min(200, parseInteger(requestUrl.searchParams.get('limit'), 100)),
      )
      json(res, 200, {
        conversation: await conversationToDto(conversation, user),
        messages: await listMessageDtos(messengerConversationId, limit),
      })
      return
    }

    if (messengerConversationId && req.method === 'POST') {
      const user = await requireUser(req, res)
      if (!user) return
      const conversation = await ensureConversationMember(messengerConversationId, user, res)
      if (!conversation) return

      const contentType = String(req.headers['content-type'] || '').toLowerCase()
      let bodyText = ''
      let attachment = null
      let replyToMessageId = null

      if (contentType.includes('multipart/form-data')) {
        let parsed
        try {
          parsed = await parseMultipartBody(req)
        } catch (error) {
          badRequest(res, error?.message || 'Не удалось прочитать файл')
          return
        }

        bodyText = parsed.fields.body || ''
        replyToMessageId =
          Number.parseInt(
            parsed.fields.replyToMessageId ||
              parsed.fields.reply_to_message_id ||
              '',
            10,
          ) || null
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
        replyToMessageId =
          Number.parseInt(body.replyToMessageId || body.reply_to_message_id || '', 10) ||
          null
      }

      const messageBody = String(bodyText || '').trim()
      if (!messageBody && !attachment) {
        badRequest(res, 'Напишите сообщение или прикрепите файл')
        return
      }

      if (replyToMessageId) {
        const repliedMessage = await getMessageByIdStatement.get(replyToMessageId)
        if (!repliedMessage || repliedMessage.conversation_id !== messengerConversationId) {
          badRequest(res, 'Сообщение для ответа не найдено в этом чате')
          return
        }
      }

      let savedFilePath = null
      let messageId = null
      try {
        messageId = await db.transaction(async (client) => {
          const result = await insertMessageStatement.runOn(
            client,
            messengerConversationId,
            user.id,
            messageBody || null,
            replyToMessageId,
          )
          const newMessageId = Number(result.lastInsertRowid)

          if (attachment) {
            savedFilePath = path.join(uploadsDir, attachment.storagePath)
            fs.writeFileSync(savedFilePath, attachment.buffer, { flag: 'wx' })
            await insertAttachmentStatement.runOn(
              client,
              newMessageId,
              attachment.originalName,
              attachment.storedName,
              attachment.mimeType,
              attachment.size,
              attachment.storagePath,
            )
          }

          await updateConversationTimestampStatement.runOn(client, messengerConversationId)
          return newMessageId
        })
      } catch (error) {
        if (savedFilePath) {
          fs.rmSync(savedFilePath, { force: true })
        }
        throw error
      }

      const messageRow = await getMessageByIdStatement.get(messageId)
      const attachments = await listAttachmentsForMessageStatement.all(messageId)
      const members = await listConversationMembersStatement.all(messengerConversationId)
      const recipientIds = members
        .map((member) => Number(member.id))
        .filter((id) => Number.isFinite(id) && id !== user.id)
      const messagePreview = buildMessagePreview(messageBody, Boolean(attachment))
      const notificationTitle =
        conversation.type === 'direct'
          ? user.name || 'Новое сообщение'
          : conversation.title || 'Сообщения'

      await notifyUsers(
        recipientIds,
        'messages',
        buildPushPayload({
          title: notificationTitle,
          body: messagePreview,
          url: '/messenger',
          tag: `message-${messengerConversationId}`,
        }),
      )

      json(res, 201, {
        conversation: await conversationToDto(await getConversationByIdStatement.get(messengerConversationId), user),
        message: messageToDto(messageRow, attachments),
      })
      return
    }

    const attachmentId = parseAttachmentPath(pathname)
    if (attachmentId && req.method === 'GET') {
      const user = await requireUser(req, res)
      if (!user) return

      const attachment = await getAttachmentByIdStatement.get(attachmentId)
      if (!attachment) {
        notFound(res, 'Файл не найден')
        return
      }

      const conversation = await ensureConversationMember(attachment.conversation_id, user, res)
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
      const access = await requirePermission(req, res, 'rolesManage')
      if (!access) return

      const rows = await listRolePermissionsStatement.all()
      const roles = rows.map((row) => ({
        role: row.role,
        permissions: mapPermissionsRow(row),
      }))

      json(res, 200, { roles })
      return
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      const access = await requirePermission(req, res, 'rolesManage')
      if (!access) return

      const users = (await listUsersForRoleManageStatement.all()).map((row) => ({
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
      const access = await requirePermission(req, res, 'rolesManage')
      if (!access) return
      const { user: actorUser } = access

      const targetUser = await getUserByIdStatement.get(userRoleTargetId)
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

      await updateUserRoleStatement.run(nextRole, userRoleTargetId)
      const updatedUser = await getUserByIdStatement.get(userRoleTargetId)

      await logAudit({
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
      const access = await requirePermission(req, res, 'rolesManage')
      if (!access) return

      const body = await readJsonBody(req)
      const roles = Array.isArray(body.roles) ? body.roles : []
      const allowedRoles = new Set(['chef', 'employee'])

      await db.transaction(async (client) => {
        for (const item of roles) {
          const role = String(item?.role || '')
          if (!allowedRoles.has(role)) continue
          const permissions = item.permissions || {}

          await upsertRolePermissionsStatement.runOn(
            client,
            role,
            toBoolInt(permissions.reportEdit),
            toBoolInt(permissions.productsManage),
            toBoolInt(permissions.scheduleManage),
            toBoolInt(permissions.auditView),
            toBoolInt(permissions.rolesManage),
          )
        }
      })

      const rows = await listRolePermissionsStatement.all()
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
