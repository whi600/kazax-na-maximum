import {
  INVENTORY_TOOL_NAME,
  parseInventoryJsonResponse,
  parseInventoryToolCalls,
} from './inventory-actions.js'
import {
  getAssistantToolMode,
  requestAssistantCompletion,
} from './openai-compatible-client.js'
import {
  INVENTORY_ASSISTANT_JSON_SYSTEM_PROMPT,
  INVENTORY_ASSISTANT_SYSTEM_PROMPT,
  buildInventoryAssistantContext,
} from './system-prompt.js'

const inventoryTool = {
  type: 'function',
  function: {
    name: INVENTORY_TOOL_NAME,
    description: 'Установить остатки для одного или нескольких товаров текущего отчёта.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              product_id: { type: 'integer' },
              remainder: { type: 'number', minimum: 0 },
            },
            required: ['product_id', 'remainder'],
          },
        },
      },
      required: ['updates'],
    },
  },
}

const readableReply = (message) => {
  if (typeof message?.content !== 'string') return ''
  return message.content.trim().slice(0, 1_000)
}

const buildFallbackReply = (actions, products) => {
  const names = new Map(products.map((product) => [Number(product.id), product.name]))
  const labels = actions.map((action) => names.get(action.productId) || 'товар')
  return 'Изменено позиций: ' + labels.length + '. ' + labels.join(', ') + '.'
}

const buildInitialMessages = ({ command, date, entries, products, toolMode }) => [
  {
    role: 'system',
    content: toolMode === 'json'
      ? INVENTORY_ASSISTANT_JSON_SYSTEM_PROMPT
      : INVENTORY_ASSISTANT_SYSTEM_PROMPT,
  },
  {
    role: 'system',
    content: 'ДАННЫЕ ТЕКУЩЕГО ОТЧЁТА:\n' + JSON.stringify(
      buildInventoryAssistantContext({ date, products, entries }),
    ),
  },
  { role: 'user', content: command },
]

const runJsonInventoryAssistant = async ({ command, date, entries, env, products }) => {
  const messages = buildInitialMessages({
    command,
    date,
    entries,
    products,
    toolMode: 'json',
  })
  const message = await requestAssistantCompletion({ messages, env })
  return parseInventoryJsonResponse({ message, products })
}

const runNativeInventoryAssistant = async ({ command, date, entries, env, products }) => {
  const initialMessages = buildInitialMessages({
    command,
    date,
    entries,
    products,
    toolMode: 'native',
  })
  const firstMessage = await requestAssistantCompletion({
    messages: initialMessages,
    tools: [inventoryTool],
    env,
  })
  const toolCalls = Array.isArray(firstMessage.tool_calls) ? firstMessage.tool_calls : []

  if (toolCalls.length === 0) {
    return {
      reply: readableReply(firstMessage) || 'Уточните товар и количество остатка.',
      actions: [],
    }
  }

  const { actions, toolOutputs } = parseInventoryToolCalls({ toolCalls, products })
  const finalMessage = await requestAssistantCompletion({
    messages: [
      ...initialMessages,
      {
        role: 'assistant',
        content: firstMessage.content || null,
        tool_calls: toolCalls,
      },
      ...toolOutputs,
    ],
    tools: [inventoryTool],
    toolChoice: 'none',
    env,
  })

  return {
    reply: readableReply(finalMessage) || buildFallbackReply(actions, products),
    actions,
  }
}

export const runInventoryAssistant = async ({
  command,
  date,
  products,
  entries,
  env = process.env,
}) => {
  const toolMode = getAssistantToolMode(env)
  const context = { command, date, entries, env, products }

  if (toolMode === 'json') return runJsonInventoryAssistant(context)
  if (toolMode === 'native') return runNativeInventoryAssistant(context)

  try {
    return await runNativeInventoryAssistant(context)
  } catch (error) {
    if (error?.code !== 'AI_TOOLS_UNSUPPORTED') throw error
    return runJsonInventoryAssistant(context)
  }
}
