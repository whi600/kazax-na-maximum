import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SUPER_ADMIN_EMAIL } from '../../server/auth.js'
import { createAppServer } from '../../server/app.js'
import { db } from '../../server/db.js'

let server
let baseUrl

const request = async (path, { cookie, body, headers, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload, cookie: response.headers.get('set-cookie') }
}

beforeAll(async () => {
  server = createAppServer({ adminEmails: new Set([SUPER_ADMIN_EMAIL]) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await db.close()
})

describe('auth and API boundaries', () => {
  it('reports health from the isolated PostgreSQL database', async () => {
    const { response, payload } = await request('/api/health')
    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.db).toContain('kofeteriy_test')
  })

  it('never trusts a public registration role', async () => {
    const superAdmin = await request('/api/auth/register', {
      method: 'POST',
      body: {
        email: SUPER_ADMIN_EMAIL,
        password: 'strong-password',
        displayName: 'Super Admin',
      },
    })
    expect(superAdmin.payload.user.role).toBe('admin')

    const employee = await request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'employee@example.test',
        password: 'strong-password',
        displayName: 'Employee',
        role: 'admin',
      },
    })
    expect(employee.response.status).toBe(201)
    expect(employee.payload.user.role).toBe('employee')

    const audit = await request('/api/audit?limit=1', { cookie: superAdmin.cookie })
    expect(audit.response.status).toBe(200)

    const forbiddenAudit = await request('/api/audit?limit=1', { cookie: employee.cookie })
    expect(forbiddenAudit.response.status).toBe(403)
  })

  it('returns a client error for malformed JSON', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JSON' })
  })
})
