import { requireUser } from '../auth.js'
import { requestAudioTranscription } from '../assistant/openai-compatible-client.js'
import { runInventoryAssistant } from '../assistant/inventory-assistant.js'
import { getToday } from '../date-utils.js'
import { HttpError } from '../errors.js'
import { badRequest, forbidden, json, readBufferBody, readJsonBody } from '../http.js'
import {
  getDailyReportStatusStatement,
  listProductsStatement,
  listTodayRecordsStatement,
} from '../statements.js'
import {
  canEditDailyReport,
  canOverrideCompletedReport,
  mapReportEntries,
} from '../services/report-service.js'

const COMMAND_LIMIT = 1_200
const TRANSCRIPTION_AUDIO_LIMIT = 20 * 1024 * 1024
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
    throw new HttpError(413, 'Аудиозапись не должна быть больше 20 МБ.', 'AUDIO_TOO_LARGE')
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

export const handleAssistantRoutes = async ({ req, res, pathname }) => {
  const isInventoryRequest = pathname === '/api/assistant/inventory' && req.method === 'POST'
  const isTranscriptionRequest = pathname === '/api/assistant/transcribe' && req.method === 'POST'
  if (!isInventoryRequest && !isTranscriptionRequest) return false

  const user = await requireUser(req, res)
  if (!user) return true

  const date = getToday()
  if (!(await canEditDailyReport(user, date))) {
    forbidden(res, 'Изменять остатки может только сотрудник со сменой или администратор.')
    return true
  }

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

  json(res, 200, result)
  return true
}
