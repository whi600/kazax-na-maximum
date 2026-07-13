import { getUserPermissions, requirePermission, requireUser } from '../auth.js'
import { json } from '../http.js'
import { getCurrentWeekStartDate, parseInteger, toShiftDto } from '../api-utils.js'
import {
  countArchiveShiftsStatement,
  listArchiveShiftEmployeeCountsStatement,
  listArchiveShiftsPageStatement,
  listPendingShiftUnbookRequestsStatement,
  listScheduleAssignableUsersStatement,
  listUpcomingShiftsStatement,
  listUserPendingShiftUnbookRequestsStatement,
} from '../statements.js'
import { getResourceRevision } from '../services/mutation-service.js'
import { attachUnbookRequestToShift, toUnbookRequestDto } from './shift-dto.js'

const handleUpcoming = async ({ req, res }) => {
  const user = await requireUser(req, res)
  if (!user) return true
  const weekStart = getCurrentWeekStartDate()
  const rows = await listUpcomingShiftsStatement.all(weekStart)
  const permissions = await getUserPermissions(user)
  const unbookRows = permissions.scheduleManage
    ? await listPendingShiftUnbookRequestsStatement.all(weekStart)
    : await listUserPendingShiftUnbookRequestsStatement.all(user.id, weekStart)
  const unbookRequests = unbookRows.map(toUnbookRequestDto)
  const requestByShiftId = new Map(
    unbookRequests.map((request) => [Number(request.shift_id), request]),
  )

  json(res, 200, {
    shifts: rows.map((shift) => attachUnbookRequestToShift(shift, requestByShiftId)),
    unbookRequests: permissions.scheduleManage ? unbookRequests : [],
    revision: await getResourceRevision('schedule'),
  })
  return true
}

const handleArchive = async ({ req, res, requestUrl }) => {
  const user = await requireUser(req, res)
  if (!user) return true
  const limit = Math.max(
    1,
    Math.min(500, parseInteger(requestUrl.searchParams.get('limit'), 10)),
  )
  const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
  const [rows, countRow, employeeCountRows] = await Promise.all([
    listArchiveShiftsPageStatement.all(limit, offset),
    countArchiveShiftsStatement.get(),
    listArchiveShiftEmployeeCountsStatement.all(),
  ])
  const total = Number(countRow?.count || 0)
  const employeeCounts = employeeCountRows.map((row) => ({
    name: row.employee_name,
    count: Number(row.count || 0),
  }))
  json(res, 200, {
    shifts: rows.map(toShiftDto),
    limit,
    offset,
    total,
    assignedTotal: employeeCounts.reduce((sum, employee) => sum + employee.count, 0),
    employeeCounts,
    hasMore: offset + limit < total,
  })
  return true
}

const handleAssignableUsers = async ({ req, res }) => {
  const access = await requirePermission(req, res, 'scheduleManage')
  if (!access) return true
  const users = (await listScheduleAssignableUsersStatement.all()).map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  }))
  json(res, 200, { users })
  return true
}

export const handleShiftQueryRoutes = async (context) => {
  const { req, pathname } = context
  if (req.method !== 'GET') return false
  if (pathname === '/api/shifts/upcoming') return handleUpcoming(context)
  if (pathname === '/api/shifts/archive') return handleArchive(context)
  if (pathname === '/api/shifts/assignable-users') return handleAssignableUsers(context)
  return false
}
