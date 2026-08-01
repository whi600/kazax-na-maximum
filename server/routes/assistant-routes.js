import { getUserPermissions, requireUser } from '../auth.js'
import { requestAudioTranscription } from '../assistant/openai-compatible-client.js'
import { runInventoryAssistant } from '../assistant/inventory-assistant.js'
import { runCalendarAssistant } from '../assistant/calendar-assistant.js'
import { executeCalendarAssistantActions } from '../assistant/calendar-executor.js'
import { runGlobalAssistant } from '../assistant/global-assistant.js'
import { runScheduleAssistant } from '../assistant/schedule-assistant.js'
import { executeScheduleAssistantActions } from '../assistant/schedule-executor.js'
import { getCurrentWeekStartDate, getToday } from '../date-utils.js'
import { HttpError } from '../errors.js'
import { badRequest, forbidden, json, readBufferBody, readJsonBody } from '../http.js'
import {
  getDailyReportStatusStatement,
  listCalendarEventsRangeStatement,
  listScheduleAssignableUsersStatement,
  listUpcomingShiftsStatement,
  listProductsStatement,
  listTodayRecordsStatement,
} from '../statements.js'
import { addDaysToDateKey } from './shift-route-utils.js'
import { parseMutationMeta } from '../services/mutation-service.js'
import {
  canEditDailyReport,
  canOverrideCompletedReport,
  mapReportEntries,
} from '../services/report-service.js'

const COMMAND_LIMIT = 1_200
const TRANSCRIPTION_AUDIO_LIMIT = 100 * 1024 * 1024
const TRANSCRIPTION_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mp3',
  'audio/mpeg',
  'audio/mpga',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
])

const getAudioMimeType = (req) =>
  String(req.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()

const getContentLength = (req) => {
  const raw = req.headers['content-length']
  if (raw === undefined) return null

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, 'Некорректный размер аудиозаписи.', 'INVALID_AUDIO_SIZE')
  }
  return value
}

const appendSkippedActions = (reply, skippedActions = []) => {
  if (!skippedActions.length) return reply
  const details = skippedActions
    .map((item) => `Действие ${item.index}: ${item.reason}`)
    .join(' ')
  return `${reply}\nНе выполнено: ${details}`.slice(0, 4_000)
}

const validateTranscriptionRequest = (req) => {
  const mimeType = getAudioMimeType(req)
  if (!TRANSCRIPTION_MIME_TYPES.has(mimeType)) {
    throw new HttpError(
      415,
      'Поддерживаются только аудиозаписи в форматах WebM, M4A, MP4, MP3, OGG, WAV, AAC или FLAC.',
      'UNSUPPORTED_AUDIO_TYPE',
    )
  }

  const contentLength = getContentLength(req)
  if (contentLength !== null && contentLength > TRANSCRIPTION_AUDIO_LIMIT) {
    throw new HttpError(413, 'Аудиозапись не должна быть больше 100 МБ.', 'AUDIO_TOO_LARGE')
  }

  return mimeType
}

const readTranscriptionAudio = async (req) => {
  try {
    return await readBufferBody(req, TRANSCRIPTION_AUDIO_LIMIT)
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Не удалось прочитать аудиозапись.', 'AUDIO_READ_ERROR')
  }
}

export const handleAssistantRoutes = async ({ req, res, pathname, db }) => {
  const isInventoryRequest = pathname === '/api/assistant/inventory' && req.method === 'POST'
  const isCalendarRequest = pathname === '/api/assistant/calendar' && req.method === 'POST'
  const isGlobalRequest = pathname === '/api/assistant/global' && req.method === 'POST'
  const isScheduleRequest = pathname === '/api/assistant/schedule' && req.method === 'POST'
  const isTranscriptionRequest = pathname === '/api/assistant/transcribe' && req.method === 'POST'
  if (!isInventoryRequest && !isCalendarRequest && !isGlobalRequest && !isScheduleRequest && !isTranscriptionRequest) return false

  const user = await requireUser(req, res)
  if (!user) return true

  if (isTranscriptionRequest) {
    const mimeType = validateTranscriptionRequest(req)
    const audio = await readTranscriptionAudio(req)
    if (audio.length === 0) {
      throw new HttpError(400, 'Аудиозапись пуста.', 'EMPTY_AUDIO')
    }

    const text = await requestAudioTranscription({ audio, mimeType })
    json(res, 200, { text })
    return true
  }

  const body = await readJsonBody(req, 10_000)
  const command = String(body.command || '').trim()
  if (!command) {
    badRequest(res, 'Скажите или напишите команду для помощника.')
    return true
  }
  if (command.length > COMMAND_LIMIT) {
    badRequest(res, 'Команда слишком длинная. Сократите её до 1200 символов.')
    return true
  }

  if (isGlobalRequest) {
    const result = await runGlobalAssistant({ command })
    json(res, 200, result)
    return true
  }

  if (isCalendarRequest) {
    const permissions = await getUserPermissions(user)
    const today = getToday()
    const [events] = await Promise.all([
      listCalendarEventsRangeStatement.all(
        addDaysToDateKey(today, -90),
        addDaysToDateKey(today, 365),
      ),
    ])
    const assistantResult = await runCalendarAssistant({
      command,
      today,
      user,
      canManageCalendar: permissions.scheduleManage,
      events,
    })
    const execution = await executeCalendarAssistantActions({
      db,
      user,
      permissions,
      actions: assistantResult.actions,
      meta: parseMutationMeta(req, body),
    })
    const skippedActions = [
      ...(assistantResult.skippedActions || []),
      ...(execution.skippedActions || []),
    ]
    json(res, 200, {
      reply: appendSkippedActions(assistantResult.reply, skippedActions),
      actions: execution.actions,
      skippedActions,
      revision: execution.revision,
    })
    return true
  }

  if (isScheduleRequest) {
    const permissions = await getUserPermissions(user)
    const weekStart = getCurrentWeekStartDate()
    const [shifts, users] = await Promise.all([
      listUpcomingShiftsStatement.all(weekStart),
      permissions.scheduleManage
        ? listScheduleAssignableUsersStatement.all()
        : Promise.resolve([]),
    ])
    const assistantResult = await runScheduleAssistant({
      command,
      today: getToday(),
      user,
      canManageSchedule: permissions.scheduleManage,
      shifts,
      users,
    })
    const execution = await executeScheduleAssistantActions({
      db,
      user,
      permissions,
      actions: assistantResult.actions,
      meta: parseMutationMeta(req, body),
    })
    const skippedActions = [
      ...(assistantResult.skippedActions || []),
      ...(execution.skippedActions || []),
    ]
    json(res, 200, {
      reply: appendSkippedActions(assistantResult.reply, skippedActions),
      actions: execution.actions,
      skippedActions,
      revision: execution.revision,
    })
    return true
  }

  const date = getToday()
  if (!(await canEditDailyReport(user, date))) {
    forbidden(res, 'Изменять остатки может только сотрудник со сменой или администратор.')
    return true
  }

  const reportStatus = await getDailyReportStatusStatement.get(date)
  if (reportStatus?.completed_at && !canOverrideCompletedReport(user)) {
    forbidden(res, 'Отчёт уже закрыт. Для изменений обратитесь к администратору.')
    return true
  }

  const [products, rows] = await Promise.all([
    listProductsStatement.all(),
    listTodayRecordsStatement.all(date),
  ])
  const result = await runInventoryAssistant({
    command,
    date,
    products,
    entries: mapReportEntries(rows),
  })

  json(res, 200, {
    ...result,
    reply: appendSkippedActions(result.reply, result.skippedActions),
  })
  return true
}
