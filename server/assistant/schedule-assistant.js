import { requestAssistantCompletion } from './openai-compatible-client.js'
import { parseScheduleCommand } from './schedule-command-parser.js'
import { parseScheduleJsonResponse } from './schedule-actions.js'
import {
  SCHEDULE_ASSISTANT_JSON_RESPONSE_FORMAT,
  SCHEDULE_ASSISTANT_JSON_SYSTEM_PROMPT,
  buildScheduleAssistantContext,
} from './schedule-system-prompt.js'

const buildMessages = ({
  command,
  today,
  user,
  canManageSchedule,
  shifts,
  users,
}) => [
  { role: 'system', content: SCHEDULE_ASSISTANT_JSON_SYSTEM_PROMPT },
  {
    role: 'system',
    content: 'АКТУАЛЬНЫЕ ДАННЫЕ РАСПИСАНИЯ:\n' + JSON.stringify(
      buildScheduleAssistantContext({
        today,
        user,
        canManageSchedule,
        shifts,
        users,
      }),
    ),
  },
  {
    role: 'user',
    content: `Текущая дата приложения: ${today}. Используй её как единственную точку отсчёта для слов «сегодня», «завтра», «послезавтра» и дней недели. Команда пользователя: ${command}`,
  },
]

export const runScheduleAssistant = async ({
  command,
  today,
  user,
  canManageSchedule,
  shifts,
  users,
  env = process.env,
}) => {
  const directResult = parseScheduleCommand({ command, today, shifts, users, canManageSchedule })
  const messages = buildMessages({
    command,
    today,
    user,
    canManageSchedule,
    shifts,
    users,
  })

  let message
  try {
    message = await requestAssistantCompletion({
      messages,
      env,
      responseFormat: SCHEDULE_ASSISTANT_JSON_RESPONSE_FORMAT,
      temperature: 0,
    })
  } catch (error) {
    if (error?.code !== 'AI_RESPONSE_FORMAT_UNSUPPORTED') throw error
    message = await requestAssistantCompletion({ messages, env, temperature: 0 })
  }

  const result = parseScheduleJsonResponse({
    message,
    shifts,
    users,
    canManageSchedule,
    today,
  })
  return directResult && !result.actions.length ? directResult : result
}
