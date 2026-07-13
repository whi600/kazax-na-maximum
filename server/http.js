export const json = (res, statusCode, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export const noContent = (res) => {
  res.writeHead(204)
  res.end()
}

export const badRequest = (res, message) => json(res, 400, { error: message })
export const unauthorized = (res, message = 'Требуется авторизация') =>
  json(res, 401, { error: message })
export const forbidden = (res, message = 'Недостаточно прав') =>
  json(res, 403, { error: message })
export const notFound = (res, message = 'Не найдено') => json(res, 404, { error: message })

export const parseCookies = (req) => {
  const raw = req.headers.cookie
  if (!raw) return {}

  return raw.split(';').reduce((acc, entry) => {
    const [key, ...rest] = entry.trim().split('=')
    if (!key) return acc
    acc[key] = decodeURIComponent(rest.join('='))
    return acc
  }, {})
}

export const setSessionCookie = ({ res, sessionCookie, sessionTtlMs, sessionId }) => {
  const parts = [
    `${sessionCookie}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export const clearSessionCookie = ({ res, sessionCookie }) => {
  const parts = [
    `${sessionCookie}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export const readJsonBody = (req, maxBodySize = 1_000_000) =>
  new Promise((resolve, reject) => {
    let total = 0
    let raw = ''

    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBodySize) {
        reject(bodyTooLargeError())
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
        reject(invalidJsonError())
      }
    })

    req.on('error', reject)
  })

export const readBufferBody = (req, maxSize) =>
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

export const withErrorHandling = async (res, fn) => {
  try {
    await fn()
  } catch (error) {
    if (isHttpError(error)) {
      json(res, error.statusCode, {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      })
      return
    }

    console.error(error)
    json(res, 500, { error: 'Внутренняя ошибка сервера' })
  }
}
import { bodyTooLargeError, invalidJsonError, isHttpError } from './errors.js'
