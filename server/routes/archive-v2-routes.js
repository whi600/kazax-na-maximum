import { isSuperAdminUser, requirePermission } from '../auth.js'
import { parseAuditJson } from '../audit.js'
import { badRequest, json } from '../http.js'
import { parseInteger, toShiftDto } from '../api-utils.js'
import { toCalendarEventDto } from './calendar-event-routes.js'
import {
  getDailyReportStatusStatement,
  listCalendarEventsDayStatement,
  listCalendarEventsRangeStatement,
  listArchiveCalendarDaysStatement,
  listArchiveDayAuditStatement,
  listArchiveDayRecordsStatement,
  listArchiveDayShiftsStatement,
  listArchiveEmployeeRequestsStatement,
  listArchiveEmployeeShiftsStatement,
  listArchiveEmployeesStatement,
  listArchivePeriodEmployeesStatement,
  listArchivePeriodProductsStatement,
} from '../statements.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/

const isValidDateKey = (value) => {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return toDateKey(date) === value
}

const toDateKey = (date) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-')

const parseMonthRange = (value) => {
  const match = String(value || '').match(MONTH_PATTERN)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: toDateKey(new Date(Date.UTC(year, month, 0))),
  }
}

const parsePeriod = (requestUrl) => {
  const start = String(requestUrl.searchParams.get('start') || '')
  const end = String(requestUrl.searchParams.get('end') || '')
  if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) return null
  return { start, end }
}

const parseEmployeeKey = (value) => {
  const key = String(value || '')
  if (key.startsWith('user:')) {
    const userId = Number(key.slice(5))
    if (Number.isSafeInteger(userId) && userId > 0) {
      return { key, userId, normalizedName: '' }
    }
  }
  if (key.startsWith('legacy:')) {
    const normalizedName = key.slice(7).trim().toLowerCase()
    if (normalizedName) return { key, userId: null, normalizedName }
  }
  return null
}

const mapRecord = (row) => ({
  id: row.id,
  product_id: row.product_id,
  arrival: Number(row.arrival || 0),
  remainder: Number(row.remainder || 0),
  write_off: Number(row.write_off || 0),
  created_at: row.record_date,
  products: {
    name: row.product_name,
    category: row.product_category,
    unit: row.product_unit,
  },
})

const mapAudit = (row) => ({
  ...row,
  before: parseAuditJson(row.before_json),
  after: parseAuditJson(row.after_json),
  context: parseAuditJson(row.context_json),
})

const handleCalendar = async ({ res, requestUrl, archiveSuperAdmin }) => {
  const range = parseMonthRange(requestUrl.searchParams.get('month'))
  if (!range) {
    badRequest(res, 'Некорректный месяц')
    return true
  }
  const [rows, eventRows] = await Promise.all([
    listArchiveCalendarDaysStatement.all(
      range.start,
      range.end,
      range.start,
      range.end,
      range.start,
      range.end,
      range.start,
      range.end,
      range.start,
      range.end,
    ),
    listCalendarEventsRangeStatement.all(range.start, range.end),
  ])
  const eventsByDate = new Map()
  for (const event of eventRows) {
    const date = event.event_date
    eventsByDate.set(date, (eventsByDate.get(date) || 0) + 1)
  }
  json(res, 200, {
    month: range.start.slice(0, 7),
    days: rows.map((row) => ({
      date: row.date,
      hasReport: Number(row.reports_count || 0) > 0,
      shiftsCount: Number(row.shifts_count || 0),
      assignedCount: Number(row.assigned_count || 0),
      changesCount: archiveSuperAdmin ? Number(row.changes_count || 0) : 0,
      eventsCount: eventsByDate.get(row.date) || 0,
    })),
  })
  return true
}

const handleDay = async ({ res, requestUrl, archiveSuperAdmin }) => {
  const date = String(requestUrl.searchParams.get('date') || '')
  if (!isValidDateKey(date)) {
    badRequest(res, 'Некорректная дата')
    return true
  }
  const [recordRows, shiftRows, auditRows, reportStatus, eventRows] = await Promise.all([
    listArchiveDayRecordsStatement.all(date),
    listArchiveDayShiftsStatement.all(date),
    archiveSuperAdmin ? listArchiveDayAuditStatement.all(date, date) : [],
    getDailyReportStatusStatement.get(date),
    listCalendarEventsDayStatement.all(date),
  ])
  json(res, 200, {
    date,
    records: recordRows.map(mapRecord),
    shifts: shiftRows.map(toShiftDto),
    events: eventRows.map(toCalendarEventDto),
    changes: auditRows.map(mapAudit),
    reportStatus: {
      completed: Boolean(reportStatus?.completed_at),
      completedAt: reportStatus?.completed_at || null,
      completedByName: reportStatus?.completed_by_name || '',
    },
  })
  return true
}

const handleEmployees = async ({ res, requestUrl }) => {
  const search = String(requestUrl.searchParams.get('search') || '').trim().slice(0, 80)
  const limit = Math.max(1, Math.min(50, parseInteger(requestUrl.searchParams.get('limit'), 20)))
  const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
  const rows = await listArchiveEmployeesStatement.all(`%${search}%`, limit, offset)
  const total = Number(rows[0]?.total_count || 0)
  json(res, 200, {
    employees: rows.map((row) => ({
      key: row.employee_key,
      userId: row.user_id,
      name: row.name,
      role: row.role,
      shiftsCount: Number(row.shifts_count || 0),
      hours: Number(row.hours || 0),
      requestsCount: Number(row.requests_count || 0),
      firstShiftDate: row.first_shift_date || null,
      lastShiftDate: row.last_shift_date || null,
    })),
    limit,
    offset,
    total,
    hasMore: offset + rows.length < total,
  })
  return true
}

const handleEmployee = async ({ res, requestUrl }) => {
  const identity = parseEmployeeKey(requestUrl.searchParams.get('key'))
  if (!identity) {
    badRequest(res, 'Некорректный сотрудник')
    return true
  }
  const limit = Math.max(1, Math.min(50, parseInteger(requestUrl.searchParams.get('limit'), 10)))
  const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
  const [shifts, requests] = await Promise.all([
    listArchiveEmployeeShiftsStatement.all(
      identity.userId,
      identity.userId,
      identity.normalizedName,
      limit,
      offset,
    ),
    listArchiveEmployeeRequestsStatement.all(
      identity.userId,
      identity.userId,
      identity.normalizedName,
      identity.userId,
    ),
  ])
  const total = Number(shifts[0]?.total_count || 0)
  json(res, 200, {
    key: identity.key,
    shifts: shifts.map((shift) => ({ ...toShiftDto(shift), hours: Number(shift.hours || 0) })),
    requests: requests.map((request) => ({
      ...request,
      totalCount: Number(request.total_count || 0),
    })),
    totals: {
      shifts: total,
      hours: Number(shifts[0]?.total_hours || 0),
      requests: Number(requests[0]?.total_count || 0),
    },
    limit,
    offset,
    hasMore: offset + shifts.length < total,
  })
  return true
}

const handlePeriod = async ({ res, requestUrl }) => {
  const period = parsePeriod(requestUrl)
  if (!period) {
    badRequest(res, 'Проверьте начало и конец периода')
    return true
  }
  const [employees, products] = await Promise.all([
    listArchivePeriodEmployeesStatement.all(period.start, period.end),
    listArchivePeriodProductsStatement.all(period.start, period.end),
  ])
  const employeeRows = employees.map((row) => ({
    key: row.employee_key,
    userId: row.user_id,
    name: row.name,
    shiftsCount: Number(row.shifts_count || 0),
    hours: Number(row.hours || 0),
  }))
  const productRows = products.map((row) => ({
    productId: row.product_id,
    name: row.product_name,
    category: row.product_category,
    unit: row.product_unit,
    arrival: Number(row.arrival || 0),
    writeOff: Number(row.write_off || 0),
    latestRemainder: Number(row.latest_remainder || 0),
  }))
  json(res, 200, {
    ...period,
    employees: employeeRows,
    products: productRows,
    totals: {
      shifts: employeeRows.reduce((sum, row) => sum + row.shiftsCount, 0),
      hours: employeeRows.reduce((sum, row) => sum + row.hours, 0),
      arrival: productRows.reduce((sum, row) => sum + row.arrival, 0),
      writeOff: productRows.reduce((sum, row) => sum + row.writeOff, 0),
    },
  })
  return true
}

export const handleArchiveV2Routes = async (context) => {
  const { req, res, pathname } = context
  if (req.method !== 'GET' || !pathname.startsWith('/api/archive/')) return false
  if (!['/api/archive/calendar', '/api/archive/day', '/api/archive/employees',
    '/api/archive/employee', '/api/archive/period'].includes(pathname)) return false
  const access = await requirePermission(req, res, 'auditView')
  if (!access) return true
  const archiveContext = {
    ...context,
    archiveSuperAdmin: isSuperAdminUser(access.user),
  }
  if (pathname === '/api/archive/calendar') return handleCalendar(archiveContext)
  if (pathname === '/api/archive/day') return handleDay(archiveContext)
  if (pathname === '/api/archive/employees') return handleEmployees(context)
  if (pathname === '/api/archive/employee') return handleEmployee(context)
  return handlePeriod(context)
}
