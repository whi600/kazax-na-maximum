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

export const createDefaultWeekTemplate = (weekStart) => {
  const start = parseDate(weekStart)
  const result = []

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = toDateKey(addDays(start, dayIndex))
    const slots =
      dayIndex === 6
        ? [
            ['09:00', '15:00'],
            ['09:00', '15:00'],
            ['14:00', '21:00'],
            ['14:00', '21:00'],
          ]
        : [
            ['09:00', '15:00'],
            ['14:00', '21:00'],
          ]

    slots.forEach(([start_time, end_time]) => {
      result.push({ date, start_time, end_time })
    })
  }

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

export const pickMissingTemplateShifts = (weekStartsList, shiftList) => {
  const available = buildShiftCountMap(shiftList)
  const missing = []

  weekStartsList.forEach((weekStart) => {
    createDefaultWeekTemplate(weekStart).forEach((templateShift) => {
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
