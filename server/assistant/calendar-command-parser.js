const normalize = (value) => String(value || '')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[.,!?;]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const pad = (value) => String(value).padStart(2, '0')
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const parseDate = (text, today) => {
  const direct = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1]
  if (direct) return direct
  const date = new Date(`${today}T12:00:00`)
  if (/(?:^|\s)послезавтра(?:$|\s)/i.test(text)) date.setDate(date.getDate() + 2)
  else if (/(?:^|\s)завтра(?:$|\s)/i.test(text)) date.setDate(date.getDate() + 1)
  else if (/(?:^|\s)сегодня(?:$|\s)/i.test(text)) return today
  else return null
  return toDateKey(date)
}

const parseTime = (text) => {
  const range = text.match(/(?:с|c)\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по|-)\s*(\d{1,2})(?::(\d{2}))?/i)
  if (range) {
    const start = `${pad(Number(range[1]))}:${pad(Number(range[2] || 0))}`
    const end = `${pad(Number(range[3]))}:${pad(Number(range[4] || 0))}`
    return start < end ? { start, end } : null
  }
  const single = text.match(/(?:^|\s)в\s*(\d{1,2})(?::(\d{2}))?/i)
  if (!single) return { start: null, end: null }
  const hour = Number(single[1])
  const minute = Number(single[2] || 0)
  if (hour > 23 || minute > 59) return null
  const startDate = new Date(2000, 0, 1, hour, minute)
  startDate.setHours(startDate.getHours() + 1)
  return { start: `${pad(hour)}:${pad(minute)}`, end: `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}` }
}

const extractTitle = (text) => {
  const quoted = text.match(/[«"]([^»"]+)[»"]/)
  if (quoted) return quoted[1].trim().slice(0, 160)
  const title = text
    .replace(/^(?:добавь|создай|запиши|поставь)\s+/i, '')
    .replace(/^(?:событие|встречу|напоминание)\s*/i, '')
    .replace(/(?:^|\s)(?:сегодня|завтра|послезавтра)(?=$|\s)/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/(?:^|\s)в\s+\d{1,2}(?::\d{2})?(?=$|\s)/gi, ' ')
    .replace(/(?:^|\s)(?:с|до|по)\s+\d{1,2}(?::\d{2})?(?=$|\s)/gi, ' ')
    .replace(/\s+на\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return title.slice(0, 160)
}

export const parseCalendarCommand = ({ command, today, canManageCalendar }) => {
  const text = normalize(command)
  if (!canManageCalendar || !/(добав|созда|запиш|постав)/i.test(text) || !/(событ|встреч|напом|календар)/i.test(text)) return null
  const date = parseDate(text, today)
  const times = parseTime(text)
  const title = extractTitle(text)
  if (!date || !times || title.length < 2) return null
  return {
    reply: 'Создаю событие в календаре.',
    actions: [{ type: 'create_event', date, title, description: null, startTime: times.start, endTime: times.end }],
  }
}
