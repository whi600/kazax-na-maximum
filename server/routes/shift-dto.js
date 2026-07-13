import { toShiftDto } from '../api-utils.js'

export const toUnbookRequestDto = (row) => ({
  id: row.id,
  type: 'unbook',
  shift_id: row.shift_id,
  requester_user_id: row.requester_user_id,
  requester_name: row.requester_name,
  employee_name: row.requester_name,
  status: row.status || 'pending',
  created_at: row.created_at,
  date: row.date,
  start_time: row.start_time,
  end_time: row.end_time,
})

export const attachUnbookRequestToShift = (shift, requestByShiftId) => ({
  ...toShiftDto(shift),
  unbook_request: requestByShiftId.get(Number(shift.id)) || null,
})
