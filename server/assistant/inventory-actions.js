import { HttpError } from '../errors.js'
import { parseAssistantJsonContent } from './json-response.js'

export const INVENTORY_TOOL_NAME = 'set_inventory_remainders'

const MAX_REMAINDER = 1_000_000
const MAX_ACTIONS = 30
const MAX_REPLY_LENGTH = 1_000

const invalidAction = (message) => {
  throw new HttpError(502, message, 'AI_INVALID_ACTION')
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (value, keys) =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))

const firstValue = (value, keys) => keys.map((key) => value?.[key]).find((item) => item !== undefined)
const asNumber = (value) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value.replace(',', '.'))
    if (Number.isFinite(number)) return number
  }
  return value
}
const normalizeName = (value) => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const resolveProductId = (value, products) => {
  const numeric = Number(value)
  if (Number.isSafeInteger(numeric) && String(value).trim() !== '') return numeric
  const target = normalizeName(value)
  if (!target) return value
  const matches = products.filter((product) => {
    const name = normalizeName(product.name)
    return name === target || (name.includes(target) && target.length >= 4)
  })
  return matches.length === 1 ? Number(matches[0].id) : value
}

const normalizeInventoryPayload = ({ payload, products }) => {
  const rootActions = Array.isArray(payload?.actions)
    ? payload.actions
    : Array.isArray(payload?.updates)
      ? payload.updates
      : Array.isArray(payload?.changes)
        ? payload.changes
        : Object.hasOwn(payload || {}, 'remainder') ? [payload] : null
  if (!rootActions) return payload
  const actions = rootActions.map((rawAction) => ({
    type: 'set_remainder',
    product_id: resolveProductId(
      firstValue(rawAction, ['product_id', 'productId', 'product', 'product_name', 'name', 'id']),
      products,
    ),
    remainder: asNumber(firstValue(rawAction, ['remainder', 'quantity', 'amount', 'count', 'value', 'stock'])),
  }))
  return {
    reply: firstValue(payload, ['reply', 'response', 'message']) || 'Готово.',
    actions,
  }
}

const parseToolArguments = (toolCall) => {
  try {
    return JSON.parse(toolCall.function.arguments || '{}')
  } catch {
    invalidAction('ИИ вернул некорректное действие.')
  }
}

const validateActions = ({ rawActions, products, seenProductIds, requireAction }) => {
  if (
    !Array.isArray(rawActions) ||
    rawActions.length > MAX_ACTIONS ||
    (requireAction && rawActions.length === 0)
  ) {
    invalidAction('ИИ вернул недопустимый список изменений остатков.')
  }

  const knownProductIds = new Set(products.map((product) => Number(product.id)))
  return rawActions.map((action) => {
    if (!hasExactKeys(action, ['type', 'product_id', 'remainder'])) {
      invalidAction('ИИ вернул неполное изменение остатка.')
    }

    const { product_id: productId, remainder } = action
    if (
      action.type !== 'set_remainder' ||
      !Number.isInteger(productId) ||
      !knownProductIds.has(productId) ||
      seenProductIds.has(productId) ||
      typeof remainder !== 'number' ||
      !Number.isFinite(remainder) ||
      remainder < 0 ||
      remainder > MAX_REMAINDER
    ) {
      invalidAction('ИИ вернул недопустимое изменение остатка.')
    }

    seenProductIds.add(productId)
    return { type: 'set_remainder', productId, remainder }
  })
}

export const parseInventoryToolCalls = ({ toolCalls, products }) => {
  const seenProductIds = new Set()
  const actions = []
  const toolOutputs = []

  for (const toolCall of toolCalls) {
    if (
      toolCall?.type !== 'function' ||
      toolCall?.function?.name !== INVENTORY_TOOL_NAME ||
      !String(toolCall?.id || '').trim()
    ) {
      invalidAction('ИИ запросил недоступное действие.')
    }

    const args = parseToolArguments(toolCall)
    if (!hasExactKeys(args, ['updates']) || !Array.isArray(args.updates)) {
      invalidAction('ИИ вернул неполный список остатков.')
    }
    const rawActions = args.updates.map((update) => {
      if (!hasExactKeys(update, ['product_id', 'remainder'])) {
        invalidAction('ИИ вернул неполное изменение остатка.')
      }
      return {
        type: 'set_remainder',
        product_id: update.product_id,
        remainder: update.remainder,
      }
    })
    const callActions = validateActions({
      rawActions,
      products,
      seenProductIds,
      requireAction: true,
    })
    if (actions.length + callActions.length > MAX_ACTIONS) {
      invalidAction('ИИ вернул слишком много изменений остатков.')
    }

    actions.push(...callActions)
    toolOutputs.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ ok: true, actions: callActions }),
    })
  }

  return { actions, toolOutputs }
}

export const parseInventoryJsonResponse = ({ message, products }) => {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (!content || content.length > 10_000) {
    invalidAction('ИИ не вернул JSON-ответ.')
  }

  const parsedPayload = parseAssistantJsonContent(content)
  if (!parsedPayload) {
    invalidAction('ИИ вернул ответ не в формате JSON.')
  }

  const payload = normalizeInventoryPayload({ payload: parsedPayload, products })
  if (!hasExactKeys(payload, ['reply', 'actions'])) {
    invalidAction('ИИ вернул неполный JSON-ответ.')
  }
  if (typeof payload.reply !== 'string' || !payload.reply.trim() || payload.reply.trim().length > MAX_REPLY_LENGTH) {
    invalidAction('ИИ вернул недопустимый текст ответа.')
  }

  if (!Array.isArray(payload.actions) || payload.actions.length > MAX_ACTIONS) {
    invalidAction('ИИ вернул недопустимый список изменений остатков.')
  }
  const seenProductIds = new Set()
  const actions = []
  const skippedActions = []
  for (const [index, rawAction] of payload.actions.entries()) {
    const seenSnapshot = new Set(seenProductIds)
    try {
      actions.push(...validateActions({
        rawActions: [rawAction],
        products,
        seenProductIds,
        requireAction: true,
      }))
    } catch (error) {
      if (payload.actions.length <= 1) throw error
      seenProductIds.clear()
      for (const productId of seenSnapshot) seenProductIds.add(productId)
      skippedActions.push({
        index: index + 1,
        code: error?.code || 'AI_INVALID_ACTION',
        reason: String(error?.message || 'Действие не выполнено.').slice(0, 300),
      })
    }
  }
  const result = { reply: payload.reply.trim(), actions }
  return skippedActions.length ? { ...result, skippedActions } : result
}
