import { requestAssistantCompletion } from './openai-compatible-client.js'
import { parseCalendarCommand } from './calendar-command-parser.js'
import { parseCalendarJsonResponse } from './calendar-actions.js'
import {
  CALENDAR_ASSISTANT_JSON_RESPONSE_FORMAT,
  CALENDAR_ASSISTANT_JSON_SYSTEM_PROMPT,
  buildCalendarAssistantContext,
} from './calendar-system-prompt.js'

export const runCalendarAssistant = async ({
  command,
  today,
  user,
  canManageCalendar,
  events,
  env = process.env,
}) => {
  const directResult = parseCalendarCommand({ command, today, canManageCalendar })
  const messages = [
    { role: 'system', content: CALENDAR_ASSISTANT_JSON_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `АКТУАЛЬНЫЕ ДАННЫЕ КАЛЕНДАРЯ:\n${JSON.stringify(buildCalendarAssistantContext({ today, user, canManageCalendar, events }))}`,
    },
    {
      role: 'user',
      content: `Текущая дата приложения: ${today}. Используй её как единственную точку отсчёта для слов «сегодня», «завтра», «послезавтра» и дней недели. Команда пользователя: ${command}`,
    },
  ]
  let message
  try {
    message = await requestAssistantCompletion({
      messages,
      env,
      responseFormat: CALENDAR_ASSISTANT_JSON_RESPONSE_FORMAT,
      temperature: 0,
    })
  } catch (error) {
    if (error?.code !== 'AI_RESPONSE_FORMAT_UNSUPPORTED') throw error
    message = await requestAssistantCompletion({ messages, env, temperature: 0 })
  }
  const result = parseCalendarJsonResponse({ message, events, canManageCalendar })
  return directResult && !result.actions.length ? directResult : result
}
