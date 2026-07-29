import { HttpError } from '../errors.js'

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

  let payload
  try {
    payload = JSON.parse(content)
  } catch {
    invalidAction('ИИ вернул ответ не в формате JSON.')
  }

  if (!hasExactKeys(payload, ['reply', 'actions'])) {
    invalidAction('ИИ вернул неполный JSON-ответ.')
  }
  if (typeof payload.reply !== 'string' || !payload.reply.trim() || payload.reply.trim().length > MAX_REPLY_LENGTH) {
    invalidAction('ИИ вернул недопустимый текст ответа.')
  }

  return {
    reply: payload.reply.trim(),
    actions: validateActions({
      rawActions: payload.actions,
      products,
      seenProductIds: new Set(),
      requireAction: false,
    }),
  }
}
