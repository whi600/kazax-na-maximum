export const parseDate = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const addDays = (date, amount) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export const getNextWeekStart = (weekStart) =>
  toDateKey(addDays(parseDate(weekStart), 7))

export const getWeekDates = (weekStart) =>
  Array.from({ length: 7 }, (_, index) =>
    toDateKey(addDays(parseDate(weekStart), index)),
  )

export const getWeekStart = (dateStr) => {
  const date = parseDate(dateStr)
  const day = date.getDay() || 7
  return toDateKey(addDays(date, 1 - day))
}

export const getCurrentWeekStart = () => getWeekStart(toDateKey(new Date()))

export const formatDateHeader = (dateStr) => {
  if (!dateStr) return ''

  const date = parseDate(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const weekDay = date
    .toLocaleDateString('ru-RU', { weekday: 'long' })
    .toUpperCase()

  return `${day}.${month} ${weekDay}`
}

export const formatShortDate = (dateStr) => {
  const date = parseDate(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${day}.${month}`
}

export const formatWeekRange = (weekStart) => {
  const start = parseDate(weekStart)
  const end = addDays(start, 6)
  return `${formatShortDate(toDateKey(start))}–${formatShortDate(toDateKey(end))}`
}

export const formatWeekDay = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase()

export const formatDateInput = (dateStr) => {
  if (!dateStr) return 'Выберите дату'
  return parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const isPastDate = (dateStr) => {
  const today = toDateKey(new Date())
  return dateStr < today
}

export const DEFAULT_WEEK_TEMPLATE_SHIFTS = [
  { day_index: 0, start_time: '09:00', end_time: '15:00' },
  { day_index: 0, start_time: '14:00', end_time: '21:00' },
  { day_index: 1, start_time: '09:00', end_time: '15:00' },
  { day_index: 1, start_time: '14:00', end_time: '21:00' },
  { day_index: 2, start_time: '09:00', end_time: '15:00' },
  { day_index: 2, start_time: '14:00', end_time: '21:00' },
  { day_index: 3, start_time: '09:00', end_time: '15:00' },
  { day_index: 3, start_time: '14:00', end_time: '21:00' },
  { day_index: 4, start_time: '09:00', end_time: '15:00' },
  { day_index: 4, start_time: '14:00', end_time: '21:00' },
  { day_index: 5, start_time: '09:00', end_time: '15:00' },
  { day_index: 5, start_time: '14:00', end_time: '21:00' },
  { day_index: 6, start_time: '09:00', end_time: '15:00' },
  { day_index: 6, start_time: '09:00', end_time: '15:00' },
  { day_index: 6, start_time: '14:00', end_time: '21:00' },
  { day_index: 6, start_time: '14:00', end_time: '21:00' },
]

export const normalizeTemplateShift = (shift) => ({
  day_index: Number(shift?.day_index ?? shift?.dayIndex ?? 0),
  start_time: String(shift?.start_time || '09:00'),
  end_time: String(shift?.end_time || '18:00'),
})

export const createDefaultWeekTemplate = (
  weekStart,
  templateShifts = DEFAULT_WEEK_TEMPLATE_SHIFTS,
) => {
  const start = parseDate(weekStart)
  const result = []

  templateShifts
    .map(normalizeTemplateShift)
    .filter((shift) => shift.day_index >= 0 && shift.day_index <= 6)
    .forEach((shift) => {
      result.push({
        date: toDateKey(addDays(start, shift.day_index)),
        start_time: shift.start_time,
        end_time: shift.end_time,
      })
    })

  return result
}

const buildShiftCountMap = (shiftList) => {
  const counts = new Map()
  shiftList.forEach((shift) => {
    const key = `${shift.date}|${shift.start_time}|${shift.end_time}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return counts
}

export const pickMissingTemplateShifts = (
  weekStartsList,
  shiftList,
  templateShifts = DEFAULT_WEEK_TEMPLATE_SHIFTS,
) => {
  const available = buildShiftCountMap(shiftList)
  const missing = []

  weekStartsList.forEach((weekStart) => {
    createDefaultWeekTemplate(weekStart, templateShifts).forEach((templateShift) => {
      const key = `${templateShift.date}|${templateShift.start_time}|${templateShift.end_time}`
      const count = available.get(key) || 0
      if (count > 0) {
        available.set(key, count - 1)
      } else {
        missing.push(templateShift)
      }
    })
  })

  return missing
}
