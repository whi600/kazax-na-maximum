import { HttpError } from '../errors.js'
import { parseAssistantJsonContent } from './json-response.js'

const TARGETS = new Set(['inventory', 'schedule', 'calendar', 'general'])

const invalid = (message) => {
  throw new HttpError(502, message, 'AI_INVALID_ROUTE')
}

const normalizeTarget = (value) => {
  const target = String(value || '').trim().toLocaleLowerCase('ru-RU')
  if (target === 'остатки' || target === 'остаток' || target === 'товары') return 'inventory'
  if (target === 'смены' || target === 'смена' || target === 'график') return 'schedule'
  if (target === 'календарь' || target === 'события' || target === 'событие') return 'calendar'
  return value
}

const normalizeGlobalPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  return {
    reply: payload.reply ?? payload.response ?? payload.message,
    target: normalizeTarget(payload.target ?? payload.section ?? payload.area),
    command: payload.command ?? payload.request ?? payload.instruction ?? '',
  }
}

export const parseGlobalJsonResponse = (message) => {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (!content || content.length > 10_000) invalid('ИИ не вернул JSON-маршрут.')
  const parsedPayload = parseAssistantJsonContent(content)
  if (!parsedPayload) invalid('ИИ вернул ответ не в формате JSON.')
  const payload = normalizeGlobalPayload(parsedPayload)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('ИИ вернул некорректный маршрут.')
  const keys = Object.keys(payload)
  if (keys.length !== 3 || !keys.every((key) => ['reply', 'target', 'command'].includes(key))) invalid('ИИ вернул неполный маршрут.')
  if (typeof payload.reply !== 'string' || !payload.reply.trim() || payload.reply.length > 1000) invalid('ИИ вернул некорректный ответ.')
  if (typeof payload.target !== 'string' || !TARGETS.has(payload.target)) invalid('ИИ выбрал недопустимый раздел приложения.')
  if (typeof payload.command !== 'string' || payload.command.length > 1200) invalid('ИИ вернул слишком длинную команду.')
  if (payload.target !== 'general' && !payload.command.trim()) invalid('ИИ не сформировал команду для раздела.')
  return { reply: payload.reply.trim(), target: payload.target, command: payload.command.trim() }
}
