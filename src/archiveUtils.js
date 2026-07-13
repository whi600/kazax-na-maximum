export const recordCategorySections = [
  { key: 'pastry', label: 'Кондитерка' },
  { key: 'bakery', label: 'Выпечка' },
  { key: 'other', label: 'Другое' },
]

const normalizeRecordCategory = (record) => {
  const category = String(record?.products?.category || record?.category || 'other')
  if (category === 'pastry' || category === 'bakery') return category
  return 'other'
}

const buildCategoryRows = ({ dateKey, rows, category }) => {
  const categoryRows = rows.filter((record) => normalizeRecordCategory(record) === category.key)
  if (categoryRows.length === 0) return []

  return [
    {
      rowType: 'category',
      id: `${dateKey}-${category.key}`,
      categoryKey: category.key,
      categoryLabel: category.label,
    },
    ...categoryRows.map((record) => ({
      ...record,
      rowType: 'record',
      categoryKey: category.key,
    })),
  ]
}

export const parseDate = (dateStr) => {
  const [year, month, rawDay] = String(dateStr || '').slice(0, 10).split('-')
  const day = Number(rawDay)
  const parsedYear = Number(year)
  const parsedMonth = Number(month)
  if (!parsedYear || !parsedMonth || !day) return new Date()
  return new Date(parsedYear, parsedMonth - 1, day)
}

export const formatDateLabel = (dateStr) => {
  if (!dateStr) return ''
  return parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export const formatShiftDay = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

export const formatShortDate = (dateStr) => {
  const date = parseDate(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

export const formatShiftWeekday = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('ru-RU', { weekday: 'long' })

export const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getRecordDateKey = (dateValue) => {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return toDateKey(date)
}

export const formatRecordWeekday = (dateKey) =>
  parseDate(dateKey).toLocaleDateString('ru-RU', { weekday: 'long' }).toUpperCase()

export const parseShiftHours = (shift) => {
  if (!shift?.date || !shift?.start_time || !shift?.end_time) return 0

  const start = new Date(`${shift.date}T${shift.start_time}`)
  const end = new Date(`${shift.date}T${shift.end_time}`)

  if (end <= start) {
    end.setDate(end.getDate() + 1)
  }

  const diff = (end - start) / 3600000
  return diff > 0 ? diff : 0
}

export const formatHours = (hours) => {
  const rounded = Math.round(hours * 10) / 10
  return String(rounded).replace('.', ',')
}

export const buildRecordsDaySections = (recordsHistory) =>
  Object.entries(recordsHistory)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, rows]) => {
      const groupedRows = recordCategorySections.flatMap((category) =>
        buildCategoryRows({ dateKey, rows, category }),
      )

      return {
        key: dateKey,
        dateLabel: formatDateLabel(dateKey),
        weekDayLabel: formatRecordWeekday(dateKey),
        rows: groupedRows.map((record, index) => ({
          ...record,
          hasCategoryDivider: record.rowType === 'category' && index > 0,
        })),
      }
    })
