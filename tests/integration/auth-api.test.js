import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SUPER_ADMIN_EMAIL } from '../../server/auth.js'
import { createAppServer } from '../../server/app.js'
import { db } from '../../server/db.js'

let server
let baseUrl
let superAdmin
let employee
let product

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

  superAdmin = await request('/api/auth/register', {
    method: 'POST',
    body: {
      email: SUPER_ADMIN_EMAIL,
      password: 'strong-password',
      displayName: 'Super Admin',
    },
  })
  employee = await request('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'employee@example.test',
      password: 'strong-password',
      displayName: 'Employee',
      role: 'admin',
    },
  })
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
    expect(superAdmin.payload.user.role).toBe('admin')
    expect(employee.response.status).toBe(201)
    expect(employee.payload.user.role).toBe('employee')

    const audit = await request('/api/audit?limit=1', { cookie: superAdmin.cookie })
    expect(audit.response.status).toBe(200)

    const forbiddenAudit = await request('/api/audit?limit=1', { cookie: employee.cookie })
    expect(forbiddenAudit.response.status).toBe(403)
  })

  it('makes assortment mutations idempotent and rejects stale versions', async () => {
    const createBody = {
      name: 'Тестовый товар',
      category: 'bakery',
      unit: 'шт',
      operationId: 'product-create-0001',
      baseRevision: 0,
    }
    const created = await request('/api/products', {
      method: 'POST',
      cookie: superAdmin.cookie,
      body: createBody,
    })
    expect(created.response.status).toBe(201)
    expect(created.payload.revision).toBe(1)
    product = created.payload.product

    const replayed = await request('/api/products', {
      method: 'POST',
      cookie: superAdmin.cookie,
      body: createBody,
    })
    expect(replayed.response.status).toBe(201)
    expect(replayed.payload).toEqual(created.payload)

    const stale = await request(`/api/products/${product.id}`, {
      method: 'PATCH',
      cookie: superAdmin.cookie,
      body: {
        name: 'Устаревшее изменение',
        category: 'bakery',
        unit: 'шт',
        operationId: 'product-update-0001',
        baseRevision: 0,
      },
    })
    expect(stale.response.status).toBe(409)
    expect(stale.payload).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 1 },
    })
  })

  it('protects report writes with revisions and replays completed operations', async () => {
    const saveBody = {
      entries: [{ product_id: product.id, arrival: 3, remainder: 2, write_off: 1 }],
      operationId: 'report-save-0001',
      baseRevision: 0,
    }
    const saved = await request('/api/daily-records/today', {
      method: 'PUT',
      cookie: superAdmin.cookie,
      body: saveBody,
    })
    expect(saved.response.status).toBe(200)
    expect(saved.payload.revision).toBe(1)

    const replayed = await request('/api/daily-records/today', {
      method: 'PUT',
      cookie: superAdmin.cookie,
      body: saveBody,
    })
    expect(replayed.payload).toEqual(saved.payload)

    const stale = await request('/api/daily-records/today', {
      method: 'PUT',
      cookie: superAdmin.cookie,
      body: {
        entries: [],
        operationId: 'report-save-0002',
        baseRevision: 0,
      },
    })
    expect(stale.response.status).toBe(409)
    expect(stale.payload.details.currentRevision).toBe(1)

    const current = await request('/api/daily-records/today', {
      cookie: superAdmin.cookie,
    })
    expect(current.payload.revision).toBe(1)
    expect(current.payload.entries).toMatchObject([
      { product_id: product.id, arrival: 3, remainder: 2, write_off: 1 },
    ])
  })

  it('accepts a queued previous-day report only for its scheduled employee', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const date = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-')
    await db.query(
      `INSERT INTO shifts(
        date, start_time, end_time, employee_name, employee_user_id, status
      ) VALUES ($1, '09:00', '15:00', 'Employee', $2, 'approved')`,
      [date, employee.payload.user.id],
    )

    const saved = await request(`/api/daily-records/${date}`, {
      method: 'PUT',
      cookie: employee.cookie,
      body: {
        entries: [{ product_id: product.id, remainder: 4 }],
        operationId: 'previous-report-0001',
        baseRevision: 0,
        offlineReplay: true,
      },
    })
    expect(saved.response.status).toBe(200)
    expect(saved.payload.revision).toBe(1)

    const loaded = await request(`/api/daily-records/${date}`, {
      cookie: employee.cookie,
    })
    expect(loaded.response.status).toBe(200)
    expect(loaded.payload.entries[0].remainder).toBe(4)
  })

  it('serializes concurrent schedule writes and rejects the stale request', async () => {
    const upcoming = await request('/api/shifts/upcoming', { cookie: superAdmin.cookie })
    expect(upcoming.response.status).toBe(200)
    const baseRevision = upcoming.payload.revision
    const date = new Date()
    date.setDate(date.getDate() + 14)
    const dateKey = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')

    const writes = await Promise.all([
      request('/api/shifts/bulk-save', {
        method: 'POST',
        cookie: superAdmin.cookie,
        body: {
          deletedIds: [],
          newShifts: [{ date: dateKey, start_time: '09:00', end_time: '12:00' }],
          operationId: 'schedule-bulk-0001',
          baseRevision,
        },
      }),
      request('/api/shifts/bulk-save', {
        method: 'POST',
        cookie: superAdmin.cookie,
        body: {
          deletedIds: [],
          newShifts: [{ date: dateKey, start_time: '13:00', end_time: '16:00' }],
          operationId: 'schedule-bulk-0002',
          baseRevision,
        },
      }),
    ])

    expect(writes.map(({ response }) => response.status).sort()).toEqual([200, 409])
    const successful = writes.find(({ response }) => response.status === 200)
    const stale = writes.find(({ response }) => response.status === 409)
    expect(successful.payload.revision).toBe(baseRevision + 1)
    expect(stale.payload).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: baseRevision + 1 },
    })

    const replay = await request('/api/shifts/bulk-save', {
      method: 'POST',
      cookie: superAdmin.cookie,
      body: successful === writes[0]
        ? {
            deletedIds: [],
            newShifts: [{ date: dateKey, start_time: '09:00', end_time: '12:00' }],
            operationId: 'schedule-bulk-0001',
            baseRevision,
          }
        : {
            deletedIds: [],
            newShifts: [{ date: dateKey, start_time: '13:00', end_time: '16:00' }],
            operationId: 'schedule-bulk-0002',
            baseRevision,
          },
    })
    expect(replay.payload).toEqual(successful.payload)

    const createdShiftId = successful.payload.createdIds[0]
    const [booking, deletion] = await Promise.all([
      request(`/api/shifts/${createdShiftId}/book`, {
        method: 'PATCH',
        cookie: employee.cookie,
      }),
      request('/api/shifts/bulk-save', {
        method: 'POST',
        cookie: superAdmin.cookie,
        body: {
          deletedIds: [createdShiftId],
          newShifts: [],
          operationId: 'schedule-bulk-delete-0001',
          baseRevision: successful.payload.revision,
        },
      }),
    ])
    expect([booking.response.status, deletion.response.status]).not.toEqual([200, 200])
    expect([booking.response.status, deletion.response.status]).toContain(200)
  })

  it('versions the default schedule template independently', async () => {
    const loaded = await request('/api/schedule-template', { cookie: superAdmin.cookie })
    const saved = await request('/api/schedule-template', {
      method: 'PUT',
      cookie: superAdmin.cookie,
      body: {
        shifts: loaded.payload.shifts.map(({ day_index, start_time, end_time }) => ({
          day_index,
          start_time,
          end_time,
        })),
        operationId: 'schedule-template-0001',
        baseRevision: loaded.payload.revision,
      },
    })
    expect(saved.response.status).toBe(200)
    expect(saved.payload.revision).toBe(loaded.payload.revision + 1)

    const stale = await request('/api/schedule-template', {
      method: 'PUT',
      cookie: superAdmin.cookie,
      body: {
        shifts: [],
        operationId: 'schedule-template-0002',
        baseRevision: loaded.payload.revision,
      },
    })
    expect(stale.response.status).toBe(409)
  })

  it('serves calendar, employee, day, and period archive scenarios', async () => {
    const today = new Date()
    const date = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    const month = date.slice(0, 7)
    await db.query(
      `INSERT INTO shifts(
        date, start_time, end_time, employee_name, employee_user_id, status
      ) VALUES ($1, '08:00', '12:00', 'Employee', $2, 'approved')`,
      [date, employee.payload.user.id],
    )

    const calendar = await request(`/api/archive/calendar?month=${month}`, {
      cookie: superAdmin.cookie,
    })
    expect(calendar.response.status).toBe(200)
    expect(calendar.payload.days.find((day) => day.date === date)).toMatchObject({
      hasReport: true,
      shiftsCount: expect.any(Number),
    })

    const employees = await request('/api/archive/employees?search=Employee', {
      cookie: superAdmin.cookie,
    })
    expect(employees.response.status).toBe(200)
    const employeeRow = employees.payload.employees.find(
      (item) => item.userId === employee.payload.user.id,
    )
    expect(employeeRow).toMatchObject({ name: 'Employee' })
    expect(employeeRow.shiftsCount).toBeGreaterThan(0)

    const detail = await request(
      `/api/archive/employee?key=${encodeURIComponent(employeeRow.key)}`,
      { cookie: superAdmin.cookie },
    )
    expect(detail.response.status).toBe(200)
    expect(detail.payload.totals.hours).toBeGreaterThanOrEqual(4)

    const day = await request(`/api/archive/day?date=${date}`, {
      cookie: superAdmin.cookie,
    })
    expect(day.response.status).toBe(200)
    expect(day.payload.records.length).toBeGreaterThan(0)
    expect(day.payload.shifts.some((shift) => shift.employee_user_id === employee.payload.user.id))
      .toBe(true)

    const period = await request(`/api/archive/period?start=${date}&end=${date}`, {
      cookie: superAdmin.cookie,
    })
    expect(period.response.status).toBe(200)
    expect(period.payload.totals.hours).toBeGreaterThanOrEqual(4)

    const forbidden = await request(`/api/archive/calendar?month=${month}`, {
      cookie: employee.cookie,
    })
    expect(forbidden.response.status).toBe(403)
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
