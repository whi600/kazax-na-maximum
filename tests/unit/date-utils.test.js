import { describe, expect, it } from 'vitest'
import {
  getCurrentWeekStartDate,
  getRetentionStartDate,
  getToday,
} from '../../server/date-utils.js'
import { getShiftDurationHours } from '../../src/scheduleUtils.js'

describe('local calendar boundaries', () => {
  const localMonday = new Date('2026-07-12T20:30:00.000Z')

  it('uses the application timezone instead of UTC date keys', () => {
    expect(getToday(localMonday)).toBe('2026-07-13')
    expect(getCurrentWeekStartDate(localMonday)).toBe('2026-07-13')
    expect(getRetentionStartDate(10, localMonday)).toBe('2026-07-04')
  })

  it('calculates valid shift duration without accepting inverted ranges', () => {
    expect(getShiftDurationHours({ start_time: '09:00', end_time: '15:30' })).toBe(6.5)
    expect(getShiftDurationHours({ start_time: '15:00', end_time: '09:00' })).toBe(0)
    expect(getShiftDurationHours({ start_time: 'bad', end_time: '09:00' })).toBe(0)
  })
})
