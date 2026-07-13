const CATEGORY_LABELS = {
  pastry: 'Кондитерка',
  bakery: 'Выпечка',
  other: 'Другое',
}

const ROLE_LABELS = {
  employee: 'Сотрудник',
  chef: 'Шеф',
  admin: 'Администратор',
}

const REPORT_SAVE_GROUP_WINDOW_MS = 2 * 60 * 1000

const toDate = (value) => {
  if (!value) return null
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? `${value}T12:00:00`
    : value
  const date = new Date(source)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDate = (value, options = { day: 'numeric', month: 'long' }) => {
  const date = toDate(value)
  return date ? date.toLocaleDateString('ru-RU', options) : ''
}

const plural = (count, one, few, many) => {
  const value = Math.abs(Number(count) || 0) % 100
  const last = value % 10
  if (value > 10 && value < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

const formatCount = (count, one, few, many) => {
  const normalized = Number(count) || 0
  return `${normalized} ${plural(normalized, one, few, many)}`
}

const formatShift = (shift = {}) => {
  const date = formatDate(shift.date)
  const time = [shift.start_time, shift.end_time].filter(Boolean).join('–')
  return [date, time].filter(Boolean).join(', ') || 'смена'
}

const formatWeekRange = (context = {}) => {
  const start = formatDate(context.weekStart)
  const end = formatDate(context.weekEnd)
  return [start, end].filter(Boolean).join(' – ')
}

const getReportDate = (log) => log.after?.record_date || log.entity_id || log.before?.record_date

const getShift = (log) => log.after?.date ? log.after : log.before || log.after || {}

const getEmployeeName = (log) =>
  log.context?.assignedUserName || log.after?.employee_name || log.before?.employee_name || ''

const changedProductFields = (before = {}, after = {}) => {
  const changes = []
  if (before.name !== after.name) changes.push(`Название: ${before.name || '—'} → ${after.name || '—'}`)
  if (before.category !== after.category) {
    changes.push(
      `Категория: ${CATEGORY_LABELS[before.category] || before.category || '—'} → ${CATEGORY_LABELS[after.category] || after.category || '—'}`,
    )
  }
  if (before.unit !== after.unit) changes.push(`Единица: ${before.unit || '—'} → ${after.unit || '—'}`)
  return changes
}

const getCategory = (action) => {
  if (action.startsWith('shift.') || action.startsWith('schedule_template.')) return 'schedule'
  if (action.startsWith('daily_report.')) return 'report'
  if (action.startsWith('product.')) return 'product'
  if (action.startsWith('user.') || action.startsWith('role.')) return 'access'
  if (action.startsWith('notification.')) return 'notification'
  return 'other'
}

const withConflictDetail = (details, context) =>
  context?.conflictResolution === 'force'
    ? [...details, 'Изменение сохранено с разрешением конфликта']
    : details

export const formatAuditEvent = (log) => {
  const action = String(log?.action || '')
  const before = log?.before || {}
  const after = log?.after || {}
  const context = log?.context || {}
  const shift = getShift(log || {})
  const shiftLabel = formatShift(shift)
  const employeeName = getEmployeeName(log || {})

  const base = {
    category: getCategory(action),
    details: [],
  }

  switch (action) {
    case 'user.register':
      return {
        ...base,
        title: `Зарегистрирован сотрудник ${after.name || after.email || ''}`.trim(),
        details: after.email ? [after.email, `Роль: ${ROLE_LABELS[after.role] || after.role}`] : [],
      }
    case 'user.role_update':
      return {
        ...base,
        title: `Изменена роль: ${after.name || before.name || after.email || before.email || 'сотрудник'}`,
        details: [`${ROLE_LABELS[before.role] || before.role || '—'} → ${ROLE_LABELS[after.role] || after.role || '—'}`],
      }
    case 'role.permissions_update':
      return {
        ...base,
        title: 'Обновлены права ролей',
        details: Array.isArray(context.changedRoles) && context.changedRoles.length
          ? [`Изменены роли: ${context.changedRoles.map((role) => ROLE_LABELS[role] || role).join(', ')}`]
          : [],
      }
    case 'notification.broadcast':
      return {
        ...base,
        title: 'Отправлено общее уведомление',
        details: [
          context.title ? `Заголовок: ${context.title}` : '',
          Number.isFinite(Number(context.sentCount))
            ? `Доставлено: ${formatCount(context.sentCount, 'уведомление', 'уведомления', 'уведомлений')}`
            : '',
        ].filter(Boolean),
      }
    case 'product.create':
      return {
        ...base,
        title: `Добавлен товар «${after.name || 'без названия'}»`,
        details: [
          after.category ? `Категория: ${CATEGORY_LABELS[after.category] || after.category}` : '',
          after.unit ? `Единица: ${after.unit}` : '',
        ].filter(Boolean),
      }
    case 'product.update':
      return {
        ...base,
        title: `Изменён товар «${after.name || before.name || 'без названия'}»`,
        details: withConflictDetail(changedProductFields(before, after), context),
      }
    case 'product.delete':
      return {
        ...base,
        title: `Удалён товар «${before.name || 'без названия'}»`,
        details: withConflictDetail([], context),
      }
    case 'daily_report.save': {
      const count = Number(after.entries_count)
      return {
        ...base,
        title: `Сохранён отчёт за ${formatDate(getReportDate(log)) || 'выбранный день'}`,
        details: Number.isFinite(count)
          ? [`Заполнено: ${formatCount(count, 'позиция', 'позиции', 'позиций')}`]
          : [],
      }
    }
    case 'daily_report.complete':
      return {
        ...base,
        title: `Отчёт за ${formatDate(getReportDate(log)) || 'выбранный день'} отмечен готовым`,
        details: [],
      }
    case 'shift.admin_create':
      return { ...base, title: `Создана смена: ${shiftLabel}`, details: [] }
    case 'shift.update':
      return {
        ...base,
        title: 'Изменена смена',
        details: [`Было: ${formatShift(before)}`, `Стало: ${formatShift(after)}`],
      }
    case 'shift.delete':
      return { ...base, title: `Удалена смена: ${formatShift(before)}`, details: [] }
    case 'shift.book':
      return {
        ...base,
        title: `Сотрудник ${employeeName || '—'} записан на смену`,
        details: [shiftLabel],
      }
    case 'shift.assign':
      return {
        ...base,
        title: `Сотрудник ${employeeName || '—'} назначен на смену`,
        details: [shiftLabel],
      }
    case 'shift.unbook':
      return {
        ...base,
        title: `Сотрудник ${employeeName || '—'} снят со смены`,
        details: [shiftLabel],
      }
    case 'shift.approve':
      return { ...base, title: 'Подтверждена заявка на смену', details: [shiftLabel] }
    case 'shift.help_request':
      return { ...base, title: 'Создана заявка на помощь', details: [shiftLabel] }
    case 'shift.unbook_request':
      return { ...base, title: 'Запрошено снятие со смены', details: [shiftLabel] }
    case 'shift.unbook_request_approve':
      return { ...base, title: 'Снятие со смены подтверждено', details: [shiftLabel] }
    case 'shift.unbook_request_reject':
      return { ...base, title: 'Заявка на снятие со смены отклонена', details: [shiftLabel] }
    case 'shift.bulk_save':
      return {
        ...base,
        title: 'Изменено расписание',
        details: withConflictDetail([
          `Добавлено: ${formatCount(context.createdCount, 'смена', 'смены', 'смен')}`,
          `Удалено: ${formatCount(context.deletedCount, 'смена', 'смены', 'смен')}`,
        ], context),
      }
    case 'shift.week_delete':
      return {
        ...base,
        title: `Удалена неделя${formatWeekRange(context) ? `: ${formatWeekRange(context)}` : ''}`,
        details: Number.isFinite(Number(context.deletedCount))
          ? [`Удалено: ${formatCount(context.deletedCount, 'смена', 'смены', 'смен')}`]
          : [],
      }
    case 'schedule_template.update':
      return {
        ...base,
        title: 'Обновлено базовое расписание',
        details: withConflictDetail(
          Number.isFinite(Number(context.count))
            ? [`В шаблоне: ${formatCount(context.count, 'смена', 'смены', 'смен')}`]
            : [],
          context,
        ),
      }
    default:
      return {
        ...base,
        title: 'Выполнено системное действие',
        details: [action || 'Неизвестное действие'],
      }
  }
}

export const formatAuditDay = (value) => {
  const date = toDate(value)
  if (!date) return 'Без даты'

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const dateKey = date.toDateString()

  if (dateKey === today.toDateString()) return 'Сегодня'
  if (dateKey === yesterday.toDateString()) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const formatAuditTime = (value) => {
  const date = toDate(value)
  return date ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''
}

const isSameReportSaveGroup = (entry, log) => {
  if (!entry || log.action !== 'daily_report.save') return false
  if (entry.action !== 'daily_report.save') return false
  if (entry.actorUserId !== log.actor_user_id) return false
  if (entry.reportDate !== getReportDate(log)) return false

  const previousDate = toDate(entry.oldestCreatedAt)
  const nextDate = toDate(log.created_at)
  return previousDate && nextDate && previousDate.getTime() - nextDate.getTime() <= REPORT_SAVE_GROUP_WINDOW_MS
}

export const buildAuditTimeline = (logs = []) => {
  const timeline = []

  for (const log of logs) {
    const previous = timeline.at(-1)
    if (isSameReportSaveGroup(previous, log)) {
      previous.eventCount += 1
      previous.logIds.push(log.id)
      previous.oldestCreatedAt = log.created_at
      previous.details = [
        ...previous.details.filter((detail) => !detail.startsWith('Сохранений подряд:')),
        `Сохранений подряд: ${previous.eventCount}`,
      ]
      continue
    }

    const event = formatAuditEvent(log)
    timeline.push({
      id: `audit-${log.id}`,
      action: log.action,
      actorName: log.actor_name || 'Система',
      actorUserId: log.actor_user_id,
      createdAt: log.created_at,
      oldestCreatedAt: log.created_at,
      reportDate: getReportDate(log),
      eventCount: 1,
      logIds: [log.id],
      title: event.title,
      category: event.category,
      details: event.details,
    })
  }

  return timeline
}

export const groupAuditTimelineByDay = (entries = []) => {
  const groups = new Map()
  for (const entry of entries) {
    const label = formatAuditDay(entry.createdAt)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(entry)
  }
  return Array.from(groups, ([label, items]) => ({ label, items }))
}

export const formatAuditAction = (log) => formatAuditEvent(log).title

export const formatAuditSummary = (log) => formatAuditEvent(log).details.at(0) || ''

export const formatAuditEntity = (entityType) => ({
  product: 'Ассортимент',
  shift: 'График',
  schedule_template: 'Базовое расписание',
  user: 'Пользователи',
  role_permissions: 'Права доступа',
  daily_report: 'Отчёт',
  notification: 'Уведомления',
}[entityType] || entityType || 'Система')
