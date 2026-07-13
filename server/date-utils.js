const pad = (value) => String(value).padStart(2, '0')

export const toLocalDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const getToday = (now = new Date()) => toLocalDateKey(now)

export const getRetentionStartDate = (days, now = new Date()) => {
  const date = new Date(now)
  date.setDate(date.getDate() - (Math.max(1, Number(days) || 1) - 1))
  return toLocalDateKey(date)
}

export const getCurrentWeekStartDate = (now = new Date()) => {
  const monday = new Date(now)
  const day = monday.getDay() || 7
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - (day - 1))
  return toLocalDateKey(monday)
}
