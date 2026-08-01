const normalize = (value) => String(value || '')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[.,!?;]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const datePattern = /\b(\d{4}-\d{2}-\d{2})\b/
const timeRangePattern = /(?:с|c)\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по|-)\s*(\d{1,2})(?::(\d{2}))?/i
const idPattern = /(?:смен(?:у|а)?|#)\s*№?\s*(\d+)/i
const monthNames = {
  январ: 0, феврал: 1, март: 2, апрел: 3, май: 4, июн: 5,
  июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11,
}
const weekdayNames = {
  понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4,
  пятница: 5, пятницу: 5, суббота: 6, субботу: 6, воскресенье: 0,
}

const pad = (value) => String(value).padStart(2, '0')
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const parseDate = (text, today) => {
  const direct = text.match(datePattern)?.[1]
  if (direct) return direct
  const base = new Date(`${today}T12:00:00`)
  if (/(?:^|\s)послезавтра(?:$|\s)/i.test(text)) {
    base.setDate(base.getDate() + 2)
    return toDateKey(base)
  }
  if (/(?:^|\s)завтра(?:$|\s)/i.test(text)) {
    base.setDate(base.getDate() + 1)
    return toDateKey(base)
  }
  if (/(?:^|\s)сегодня(?:$|\s)/i.test(text)) return today

  const monthMatch = text.match(/(?:^|\s)(\d{1,2})\s+(январ\w*|феврал\w*|март\w*|апрел\w*|май\w*|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)(?=$|\s)/i)
  if (monthMatch) {
    const monthKey = Object.keys(monthNames).find((key) => monthMatch[2].toLocaleLowerCase('ru-RU').startsWith(key))
    if (monthKey) {
      const year = Number(today.slice(0, 4))
      const candidate = new Date(year, monthNames[monthKey], Number(monthMatch[1]), 12)
      if (toDateKey(candidate) < today) candidate.setFullYear(year + 1)
      return toDateKey(candidate)
    }
  }

  const weekdayMatch = Object.keys(weekdayNames).find((name) => new RegExp(`(?:^|\\s)${name}(?=$|\\s)`, 'i').test(text))
  if (weekdayMatch) {
    const target = weekdayNames[weekdayMatch]
    const candidate = new Date(base)
    const delta = (target - candidate.getDay() + 7) % 7 || 7
    candidate.setDate(candidate.getDate() + delta)
    return toDateKey(candidate)
  }
  return null
}

const parseTimeRange = (text) => {
  const match = text.match(timeRangePattern) || text.match(/\b(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\b/)
  if (!match) return null
  const startHour = Number(match[1])
  const startMinute = Number(match[2] || 0)
  const endHour = Number(match[3])
  const endMinute = Number(match[4] || 0)
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null
  const start = `${pad(startHour)}:${pad(startMinute)}`
  const end = `${pad(endHour)}:${pad(endMinute)}`
  return start < end ? { start, end } : null
}

const findShift = ({ text, date, times, shifts }) => {
  const id = Number(text.match(idPattern)?.[1])
  if (Number.isSafeInteger(id)) return shifts.find((shift) => Number(shift.id) === id) || null
  if (!date) return null
  const candidates = shifts.filter((shift) => shift.date === date)
  if (!times) return candidates.length === 1 ? candidates[0] : null
  const exact = candidates.filter((shift) => shift.start_time === times.start && shift.end_time === times.end)
  return exact.length === 1 ? exact[0] : null
}

const findUser = (text, users) => {
  const matches = users.filter((user) => {
    const name = normalize(user.name)
    return name && text.includes(name)
  })
  return matches.length === 1 ? matches[0] : null
}

export const parseScheduleCommand = ({ command, today, shifts, users, canManageSchedule }) => {
  const text = normalize(command)
  if (!/(смен|график|дежур|займ|возьм|выйд|запиш|постав|назнач|создай|добав)/i.test(text)) return null
  const date = parseDate(text, today)
  const times = parseTimeRange(text)
  const shift = findShift({ text, date, times, shifts })
  const user = canManageSchedule ? findUser(text, users) : null

  if (canManageSchedule && /(назнач|поставь|прикреп)/i.test(text) && shift && user) {
    return { reply: 'Назначаю сотрудника на смену.', actions: [{ type: 'assign_shift', shiftId: Number(shift.id), userId: Number(user.id) }] }
  }
  if (canManageSchedule && /(перенес|измени|сдвин|поменяй)/i.test(text) && shift && date && times) {
    return { reply: 'Обновляю смену.', actions: [{ type: 'update_shift', shiftId: Number(shift.id), date, startTime: times.start, endTime: times.end }] }
  }
  if (canManageSchedule && /(создай|добавь|новую смен)/i.test(text) && date && times) {
    return { reply: 'Создаю смену.', actions: [{ type: 'create_shift', date, startTime: times.start, endTime: times.end, assigneeUserId: user ? Number(user.id) : null }] }
  }
  if (/(займ|возьм|выйд|запиш|поставь?\s+меня)/i.test(text) && shift && !shift.employee_name) {
    return { reply: 'Занимаю свободную смену.', actions: [{ type: 'book_shift', shiftId: Number(shift.id) }] }
  }
  return null
}
