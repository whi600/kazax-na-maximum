import { HttpError } from '../errors.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-5.6-luna'
const DEFAULT_TRANSCRIPTION_MODEL = 'openai/whisper-1'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 120_000
const TOOL_MODES = new Set(['auto', 'native', 'json'])

const stripTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '')

const toTimeout = (value) => {
  const timeout = Number(value)
  if (!Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(timeout, 1_000), 60_000)
}

const toTranscriptionTimeout = (value) => {
  const timeout = Number(value)
  if (!Number.isFinite(timeout)) return DEFAULT_TRANSCRIPTION_TIMEOUT_MS
  return Math.min(Math.max(timeout, 5_000), 180_000)
}

export const getAssistantToolMode = (env = process.env) => {
  const mode = String(env.AI_TOOL_MODE || 'json').trim().toLowerCase()
  if (TOOL_MODES.has(mode)) return mode

  throw new HttpError(
    500,
    'Некорректный режим AI_TOOL_MODE. Используйте auto, native или json.',
    'AI_INVALID_TOOL_MODE',
  )
}

const getAssistantConfig = (env = process.env) => {
  const apiKey = String(env.AI_API_KEY || '').trim()
  if (!apiKey) {
    throw new HttpError(
      503,
      'ИИ-помощник пока не настроен. Добавьте AI_API_KEY в файл .env.',
      'AI_NOT_CONFIGURED',
    )
  }

  return {
    apiKey,
    baseUrl: stripTrailingSlash(env.AI_API_BASE_URL) || DEFAULT_BASE_URL,
    model: String(env.AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    transcriptionModel:
      String(env.AI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL).trim()
      || DEFAULT_TRANSCRIPTION_MODEL,
    timeoutMs: toTimeout(env.AI_TIMEOUT_MS),
    transcriptionTimeoutMs: toTranscriptionTimeout(env.AI_TRANSCRIPTION_TIMEOUT_MS),
  }
}

const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

const isToolsUnsupportedResponse = (response, payload) => {
  if (!response || response.status < 400 || response.status >= 500) return false
  const error = payload?.error || {}
  const text = [error.message, error.code, error.type, payload?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    /(tool|function)/.test(text) &&
    /(unsupported|not supported|not available|disabled|not allowed|unknown|unrecognized)/.test(text)
  )
}

const isResponseFormatUnsupportedResponse = (response, payload) => {
  if (!response || response.status < 400 || response.status >= 500) return false
  const error = payload?.error || {}
  const text = [error.message, error.code, error.type, payload?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    /(response[ _-]?format|json[ _-]?schema|structured output)/.test(text) &&
    /(unsupported|not supported|not available|disabled|not allowed|unknown|unrecognized)/.test(text)
  )
}

export const requestAssistantCompletion = async ({
  messages,
  tools = [],
  toolChoice = 'auto',
  responseFormat,
  temperature,
  env = process.env,
}) => {
  const config = getAssistantConfig(env)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(Number.isFinite(temperature) ? { temperature } : {}),
      }),
      signal: controller.signal,
    })
    const payload = await readJson(response)

    if (!response.ok) {
      if (responseFormat && isResponseFormatUnsupportedResponse(response, payload)) {
        throw new HttpError(
          502,
          'Подключённая модель не поддерживает структурированный JSON-ответ.',
          'AI_RESPONSE_FORMAT_UNSUPPORTED',
        )
      }
      if (tools.length && isToolsUnsupportedResponse(response, payload)) {
        throw new HttpError(
          502,
          'Подключённая модель не поддерживает вызов инструментов.',
          'AI_TOOLS_UNSUPPORTED',
        )
      }
      throw new HttpError(
        502,
        'Сервис ИИ временно недоступен. Повторите попытку позже.',
        'AI_PROVIDER_ERROR',
      )
    }

    const message = payload?.choices?.[0]?.message
    if (!message || typeof message !== 'object') {
      throw new HttpError(502, 'ИИ не вернул понятный ответ.', 'AI_INVALID_RESPONSE')
    }

    return message
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error?.name === 'AbortError') {
      throw new HttpError(504, 'ИИ отвечает слишком долго. Повторите попытку.', 'AI_TIMEOUT')
    }
    throw new HttpError(
      502,
      'Не удалось связаться с сервисом ИИ. Проверьте настройки API.',
      'AI_CONNECTION_ERROR',
    )
  } finally {
    clearTimeout(timeout)
  }
}

const getAudioDataUrl = ({ audio, mimeType }) => {
  if (!Buffer.isBuffer(audio) || audio.length === 0) {
    throw new HttpError(400, 'Аудиозапись пуста.', 'EMPTY_AUDIO')
  }

  const normalizedMimeType = String(mimeType || '').trim().toLowerCase()
  if (!normalizedMimeType.startsWith('audio/')) {
    throw new HttpError(400, 'Некорректный формат аудиозаписи.', 'INVALID_AUDIO_TYPE')
  }

  return `data:${normalizedMimeType};base64,${audio.toString('base64')}`
}

export const requestAudioTranscription = async ({
  audio,
  mimeType,
  env = process.env,
}) => {
  const config = getAssistantConfig(env)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.transcriptionTimeoutMs)

  try {
    const response = await fetch(config.baseUrl + '/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: getAudioDataUrl({ audio, mimeType }),
        model: config.transcriptionModel,
        language: 'ru',
        response_format: 'json',
        temperature: 0,
      }),
      signal: controller.signal,
    })
    const payload = await readJson(response)

    if (!response.ok) {
      throw new HttpError(
        502,
        'Сервис распознавания речи временно недоступен. Повторите попытку позже.',
        'AI_TRANSCRIPTION_PROVIDER_ERROR',
      )
    }

    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new HttpError(
        502,
        'Сервис распознавания речи не вернул текст.',
        'AI_TRANSCRIPTION_INVALID_RESPONSE',
      )
    }

    return text
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error?.name === 'AbortError') {
      throw new HttpError(
        504,
        'Распознавание речи отвечает слишком долго. Повторите попытку.',
        'AI_TRANSCRIPTION_TIMEOUT',
      )
    }
    throw new HttpError(
      502,
      'Не удалось связаться с сервисом распознавания речи. Проверьте настройки API.',
      'AI_TRANSCRIPTION_CONNECTION_ERROR',
    )
  } finally {
    clearTimeout(timeout)
  }
}
