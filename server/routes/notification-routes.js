import { toBoolInt, requirePermission, requireUser } from '../auth.js'
import { logAudit } from '../audit.js'
import { badRequest, json, readJsonBody } from '../http.js'
import {
  buildPushPayload,
  ensureNotificationSettings,
  notifyUsers,
  pushConfig,
} from '../notifications.js'
import {
  deletePushSubscriptionStatement,
  listNotificationTargetUsersStatement,
  upsertNotificationSettingsStatement,
  upsertPushSubscriptionStatement,
} from '../statements.js'

export const handleNotificationRoutes = async ({ req, res, pathname }) => {
  if (pathname === '/api/notifications/settings' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    json(res, 200, {
      settings: await ensureNotificationSettings(user.id),
      pushAvailable: pushConfig.enabled,
      publicKey: pushConfig.publicKey,
    })
    return true
  }

  if (pathname === '/api/notifications/settings' && req.method === 'PUT') {
    const user = await requireUser(req, res)
    if (!user) return true

    const current = await ensureNotificationSettings(user.id)
    const body = await readJsonBody(req)
    const next = {
      push_enabled: body.push_enabled ?? current.push_enabled,
      shifts_enabled: body.shifts_enabled ?? current.shifts_enabled,
      reminders_enabled: body.reminders_enabled ?? current.reminders_enabled,
    }

    await upsertNotificationSettingsStatement.run(
      user.id,
      toBoolInt(next.push_enabled, 1),
      toBoolInt(next.shifts_enabled, 1),
      toBoolInt(next.reminders_enabled, 1),
    )

    json(res, 200, {
      settings: await ensureNotificationSettings(user.id),
      pushAvailable: pushConfig.enabled,
      publicKey: pushConfig.publicKey,
    })
    return true
  }

  if (pathname === '/api/notifications/subscriptions' && req.method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return true

    const body = await readJsonBody(req)
    const subscription = body.subscription || {}
    const endpoint = String(subscription.endpoint || '').trim()
    const p256dh = String(subscription.keys?.p256dh || '').trim()
    const authKey = String(subscription.keys?.auth || '').trim()
    const userAgent = String(body.userAgent || '').trim().slice(0, 500)

    if (!endpoint || !p256dh || !authKey) {
      badRequest(res, 'Некорректная push-подписка')
      return true
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
    return true
  }

  if (pathname === '/api/notifications/subscriptions' && req.method === 'DELETE') {
    const user = await requireUser(req, res)
    if (!user) return true

    const body = await readJsonBody(req)
    const endpoint = String(body.endpoint || '').trim()
    if (!endpoint) {
      badRequest(res, 'Не передан endpoint подписки')
      return true
    }

    await deletePushSubscriptionStatement.run(endpoint)
    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/notifications/test' && req.method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return true

    await notifyUsers(
      [user.id],
      'shifts',
      buildPushPayload({
        title: 'Тест уведомлений',
        body: 'Push-уведомления работают на этом устройстве',
        url: '/profile',
        tag: `push-test-${user.id}`,
      }),
    )

    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/notifications/broadcast' && req.method === 'POST') {
    const access = await requirePermission(req, res, 'scheduleManage')
    if (!access) return true
    const { user } = access

    const body = await readJsonBody(req)
    const title = String(body.title || '').trim().slice(0, 80)
    const message = String(body.message || '').trim().slice(0, 240)

    if (!title || !message) {
      badRequest(res, 'Заполните заголовок и текст уведомления')
      return true
    }

    const userIds = (await listNotificationTargetUsersStatement.all()).map((row) =>
      Number(row.id),
    )
    const sentCount = await notifyUsers(
      userIds,
      'shifts',
      buildPushPayload({
        title,
        body: message,
        url: '/profile',
        tag: `broadcast-${Date.now()}`,
        urgency: 'high',
      }),
    )

    await logAudit({
      actorUser: user,
      entityType: 'notification',
      action: 'notification.broadcast',
      context: {
        title,
        recipientCount: userIds.length,
        sentCount,
      },
    })

    json(res, 200, { ok: true, sentCount })
    return true
  }

  return false
}
