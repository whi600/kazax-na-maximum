import { requestAssistantCompletion } from './openai-compatible-client.js'
import { parseGlobalJsonResponse } from './global-actions.js'
import {
  GLOBAL_ASSISTANT_JSON_RESPONSE_FORMAT,
  GLOBAL_ASSISTANT_JSON_SYSTEM_PROMPT,
} from './global-system-prompt.js'

const targetPatterns = [
  ['calendar', /(календар|событи|встреч|напомн|мероприят|праздник)/i],
  ['schedule', /(смен|график|дежур|работать|выйти|займ|занять|назнач|сотрудник)/i],
  ['inventory', /(остат|товар|продукт|наличи|запас|приход|списан|количеств)/i],
]

export const detectGlobalTarget = (command) => {
  const text = String(command || '').trim()
  if (!text) return null
  const matches = targetPatterns.filter(([, pattern]) => pattern.test(text)).map(([target]) => target)
  return matches.length === 1 ? matches[0] : null
}

export const runGlobalAssistant = async ({ command, env = process.env }) => {
  const detectedTarget = detectGlobalTarget(command)
  if (detectedTarget) {
    return {
      reply: 'Передаю запрос в нужный раздел.',
      target: detectedTarget,
      command: String(command).trim(),
    }
  }

  const messages = [
    { role: 'system', content: GLOBAL_ASSISTANT_JSON_SYSTEM_PROMPT },
    { role: 'user', content: command },
  ]
  let message
  try {
    message = await requestAssistantCompletion({
      messages,
      env,
      responseFormat: GLOBAL_ASSISTANT_JSON_RESPONSE_FORMAT,
      temperature: 0,
    })
  } catch (error) {
    if (error?.code !== 'AI_RESPONSE_FORMAT_UNSUPPORTED') throw error
    message = await requestAssistantCompletion({ messages, env, temperature: 0 })
  }
  return parseGlobalJsonResponse(message)
}
