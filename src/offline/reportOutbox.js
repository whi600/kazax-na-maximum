import {
  deleteOfflineRecord,
  deleteOfflineRecordIf,
  getAllOfflineRecords,
  getOfflineRecord,
  putOfflineRecord,
} from './indexedDb.js'
import { normalizeReportEntries } from '../report/reportEntries.js'
import { createOperationId } from '../utils/operationId.js'

const FALLBACK_PREFIX = 'kofeyny:report-outbox:v3:'
const LEGACY_PREFIX = 'kofeyny:daily-report-draft:v2'

export const getReportOperationKey = (userId, recordDate) =>
  `${userId}:${recordDate}`

const fallbackKey = (key) => `${FALLBACK_PREFIX}${key}`

const getLocalStorage = () => {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

const readFallback = (key) => {
  const storage = getLocalStorage()
  if (!storage) return null
  try {
    return JSON.parse(storage.getItem(fallbackKey(key)))
  } catch {
    return null
  }
}

const writeFallback = (record) => {
  const storage = getLocalStorage()
  if (!storage) throw new Error('Local storage is unavailable')
  storage.setItem(fallbackKey(record.key), JSON.stringify(record))
  return record
}

export const getReportOperation = async (userId, recordDate) => {
  const key = getReportOperationKey(userId, recordDate)
  try {
    return (await getOfflineRecord(key)) || readFallback(key)
  } catch {
    return readFallback(key)
  }
}

export const putReportOperation = async (operation) => {
  try {
    await putOfflineRecord(operation)
    getLocalStorage()?.removeItem(fallbackKey(operation.key))
    return operation
  } catch {
    return writeFallback(operation)
  }
}

export const listReportOperations = async (userId) => {
  let records = []
  try {
    records = await getAllOfflineRecords()
  } catch {
    // Fallback records are collected below.
  }

  const storage = getLocalStorage()
  if (storage) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(FALLBACK_PREFIX)) continue
      try {
        records.push(JSON.parse(storage.getItem(key)))
      } catch {
        // Ignore a broken fallback row without blocking other drafts.
      }
    }
  }

  const unique = new Map()
  records
    .filter((record) => String(record?.userId) === String(userId))
    .forEach((record) => unique.set(record.key, record))
  return [...unique.values()].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  )
}

export const queueReportOperation = async ({
  userId,
  recordDate,
  entries,
  baseEntries,
  baseRevision,
  completionRequested = false,
}) => {
  const existing = await getReportOperation(userId, recordDate)
  const now = new Date().toISOString()
  return putReportOperation({
    key: getReportOperationKey(userId, recordDate),
    userId,
    recordDate,
    entries: normalizeReportEntries(entries),
    baseEntries: normalizeReportEntries(existing?.baseEntries || baseEntries),
    baseRevision: Number(existing?.baseRevision ?? baseRevision ?? 0),
    operationId: createOperationId(),
    completionRequested: Boolean(existing?.completionRequested || completionRequested),
    completionOperationId:
      existing?.completionOperationId || (completionRequested ? createOperationId() : null),
    status: 'local',
    lastError: '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  })
}

export const rebaseReportOperation = async (operation, {
  entries,
  baseEntries,
  baseRevision,
}) => putReportOperation({
  ...operation,
  entries: normalizeReportEntries(entries),
  baseEntries: normalizeReportEntries(baseEntries),
  baseRevision: Number(baseRevision || 0),
  operationId: createOperationId(),
  status: 'local',
  lastError: '',
  conflictData: null,
  updatedAt: new Date().toISOString(),
})

export const updateReportOperation = (operation, patch) =>
  putReportOperation({
    ...operation,
    ...patch,
    updatedAt: new Date().toISOString(),
  })

export const removeReportOperation = async (operation) => {
  try {
    const removed = await deleteOfflineRecordIf(
      operation.key,
      (current) => current.operationId === operation.operationId,
    )
    if (!removed) return false
  } catch {
    const current = readFallback(operation.key)
    if (current?.operationId !== operation.operationId) return false
  }

  getLocalStorage()?.removeItem(fallbackKey(operation.key))
  return true
}

export const discardReportOperation = async (userId, recordDate) => {
  const key = getReportOperationKey(userId, recordDate)
  try {
    await deleteOfflineRecord(key)
  } catch {
    // The fallback entry is still removed below.
  }
  getLocalStorage()?.removeItem(fallbackKey(key))
}

export const migrateLegacyReportDraft = async ({
  userId,
  recordDate,
  baseEntries,
  baseRevision,
}) => {
  const storage = getLocalStorage()
  if (!storage) return null
  const existing = await getReportOperation(userId, recordDate)
  if (existing) return existing

  const legacyKey = `${LEGACY_PREFIX}:${userId}:${recordDate}`
  try {
    const legacy = JSON.parse(storage.getItem(legacyKey))
    if (!Array.isArray(legacy?.entries)) return null
    const migrated = await queueReportOperation({
      userId,
      recordDate,
      entries: legacy.entries,
      baseEntries,
      baseRevision,
    })
    storage.removeItem(legacyKey)
    return migrated
  } catch {
    return null
  }
}
