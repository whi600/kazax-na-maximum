import fs from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'

const dataDir = path.resolve(process.cwd(), 'data')
const vapidKeysPath = path.join(dataDir, 'push-vapid-keys.json')
const vapidSubject =
  process.env.VAPID_SUBJECT ||
  process.env.PUSH_CONTACT ||
  'mailto:admin@restosmena.ru'

fs.mkdirSync(dataDir, { recursive: true })

const readStoredKeys = () => {
  try {
    if (!fs.existsSync(vapidKeysPath)) return null
    const raw = fs.readFileSync(vapidKeysPath, 'utf8')
    const payload = JSON.parse(raw)
    if (!payload?.publicKey || !payload?.privateKey) return null
    return payload
  } catch {
    return null
  }
}

const ensureVapidKeys = () => {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    }
  }

  const stored = readStoredKeys()
  if (stored) return stored

  const generated = webpush.generateVAPIDKeys()
  fs.writeFileSync(vapidKeysPath, JSON.stringify(generated, null, 2))
  return generated
}

const vapidKeys = ensureVapidKeys()

webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey)

export const pushConfig = {
  enabled: true,
  publicKey: vapidKeys.publicKey,
  subject: vapidSubject,
}

const toSubscription = (row) => ({
  endpoint: row.endpoint,
  keys: {
    p256dh: row.p256dh_key,
    auth: row.auth_key,
  },
})

export const sendPushNotification = async (row, payload) => {
  try {
    await webpush.sendNotification(
      toSubscription(row),
      JSON.stringify(payload),
      {
        TTL: 60,
        urgency: payload.urgency || 'normal',
      },
    )

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      statusCode: error?.statusCode || 0,
      message: error?.body || error?.message || 'Push delivery failed',
    }
  }
}
