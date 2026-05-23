import { db } from '../db.js'

export const listScheduleTemplateShiftsStatement = db.prepare(`
  SELECT id, day_index, start_time, end_time, sort_order
  FROM schedule_template_shifts
  ORDER BY day_index ASC, sort_order ASC, start_time ASC, id ASC
`)

export const deleteScheduleTemplateShiftsStatement = db.prepare(`
  DELETE FROM schedule_template_shifts
`)

export const insertScheduleTemplateShiftStatement = db.prepare(`
  INSERT INTO schedule_template_shifts(day_index, start_time, end_time, sort_order, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  RETURNING id
`)
