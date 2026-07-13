import { ApiError, recordsApi } from '../api'
import {
  applyReportConflictChoices,
  buildReportPayload,
  mergeReportVersions,
  normalizeReportEntries,
} from './reportEntries'
import {
  discardReportOperation,
  getReportOperation,
  listReportOperations,
  queueReportOperation,
  rebaseReportOperation,
  removeReportOperation,
  updateReportOperation,
} from '../offline/reportOutbox'

const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000]

const localDateKey = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

export const createReportSyncManager = ({
  currentUser,
  dailyEntries,
  reportDate,
  reportRevision,
  reportConflict,
  getBaseEntries,
  setBaseEntries,
  applyReportStatus,
  setReportStatus,
}) => {
  let retryTimer = null
  let retryAttempt = 0
  let syncTask = null
  let listenersAttached = false

  const showConflict = (operation) => {
    if (!operation.conflictData) return
    reportConflict.value = { operation, ...operation.conflictData }
    setReportStatus('conflict')
  }

  const scheduleRetry = () => {
    if (retryTimer || !isOnline()) return
    const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)]
    retryAttempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      flush()
    }, delay)
  }

  const handleConflict = async (operation, error) => {
    const serverReport = await recordsApi.report(operation.recordDate)
    const merged = mergeReportVersions({
      baseEntries: operation.baseEntries,
      localEntries: operation.entries,
      serverEntries: serverReport.entries,
    })

    if (merged.conflicts.length === 0) {
      await rebaseReportOperation(operation, {
        entries: merged.entries,
        baseEntries: serverReport.entries,
        baseRevision: serverReport.revision,
      })
      if (operation.recordDate === reportDate.value) dailyEntries.value = merged.entries
      return 'retry'
    }

    const conflicted = await updateReportOperation(operation, {
      status: 'conflict',
      lastError: error.message,
      conflictData: {
        entries: merged.entries,
        conflicts: merged.conflicts,
        serverEntries: normalizeReportEntries(serverReport.entries),
        serverRevision: Number(serverReport.revision || 0),
        serverStatus: serverReport.reportStatus,
      },
    })
    showConflict(conflicted)
    return 'blocked'
  }

  const finishOperation = async (operation, syncing, saved) => {
    let revision = Number(saved.revision || operation.baseRevision + 1)
    const latest = await getReportOperation(operation.userId, operation.recordDate)

    if (latest?.operationId && latest.operationId !== operation.operationId) {
      await rebaseReportOperation(latest, {
        entries: latest.entries,
        baseEntries: operation.entries,
        baseRevision: revision,
      })
      return 'retry'
    }

    let completedStatus = null
    if (syncing.completionRequested) {
      const completed = await recordsApi.completeReport(operation.recordDate, {
        operationId: syncing.completionOperationId,
        baseRevision: revision,
        offlineReplay: operation.recordDate !== localDateKey(),
      })
      revision = Number(completed.revision || revision + 1)
      completedStatus = completed.reportStatus
    }

    if (!(await removeReportOperation(syncing))) return 'retry'
    retryAttempt = 0
    if (operation.recordDate === reportDate.value) {
      setBaseEntries(operation.entries)
      reportRevision.value = revision
      reportConflict.value = null
      applyReportStatus(completedStatus)
      setReportStatus('saved')
    } else {
      setReportStatus('saved')
    }
    return 'done'
  }

  const syncOperation = async (operation) => {
    if (operation.status === 'conflict' || operation.status === 'error') return 'blocked'
    const isCurrent = operation.recordDate === reportDate.value
    const syncing = await updateReportOperation(operation, { status: 'syncing', lastError: '' })
    if (isCurrent) setReportStatus('saving')

    try {
      const saved = await recordsApi.saveReport(
        operation.recordDate,
        buildReportPayload(operation.entries),
        {
          operationId: operation.operationId,
          baseRevision: operation.baseRevision,
          offlineReplay: operation.recordDate !== localDateKey(),
        },
      )
      return await finishOperation(operation, syncing, saved)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
        try {
          return await handleConflict(operation, error)
        } catch (loadError) {
          error = loadError
        }
      }

      const retryable = !(error instanceof ApiError) || error.status === 0 || error.status >= 500
      const status = retryable ? 'pending' : 'error'
      await updateReportOperation(operation, {
        status,
        lastError: error?.message || 'Не удалось отправить отчет',
      })
      if (isCurrent) setReportStatus(status)
      if (retryable) scheduleRetry()
      return 'blocked'
    }
  }

  const run = async () => {
    const userId = currentUser.value?.id
    if (!userId) return
    if (!isOnline()) {
      if (await getReportOperation(userId, reportDate.value)) setReportStatus('pending')
      return
    }

    for (let pass = 0; pass < 20; pass += 1) {
      const queued = await listReportOperations(userId)
      const conflict = queued.find((operation) => operation.status === 'conflict')
      if (conflict && !reportConflict.value) showConflict(conflict)
      if (queued.some((operation) => operation.status === 'error')) setReportStatus('error')
      const operations = queued
        .filter((operation) => operation.status !== 'conflict' && operation.status !== 'error')
      if (operations.length === 0) return

      let repeat = false
      for (const operation of operations) {
        const result = await syncOperation(operation)
        if (result === 'retry' || result === 'done') repeat = true
      }
      if (!repeat) return
    }
  }

  const flush = () => {
    if (syncTask) return syncTask
    syncTask = run().finally(() => {
      syncTask = null
    })
    return syncTask
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') flush()
  }

  const attach = () => {
    if (listenersAttached || typeof window === 'undefined') return
    listenersAttached = true
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  const queueCurrent = (completionRequested = false) => queueReportOperation({
    userId: currentUser.value?.id,
    recordDate: reportDate.value || localDateKey(),
    entries: dailyEntries.value,
    baseEntries: getBaseEntries(),
    baseRevision: reportRevision.value,
    completionRequested,
  })

  const retry = async () => {
    const operations = await listReportOperations(currentUser.value?.id)
    const operation = operations.find((item) => item.recordDate === reportDate.value)
      || operations.find((item) => item.status === 'error')
    if (operation && operation.status !== 'conflict') {
      await updateReportOperation(operation, { status: 'local', lastError: '' })
    }
    await flush()
  }

  const resolve = async (choices) => {
    const conflict = reportConflict.value
    if (!conflict) return
    const entries = applyReportConflictChoices(conflict, choices)
    await rebaseReportOperation(conflict.operation, {
      entries,
      baseEntries: conflict.serverEntries,
      baseRevision: conflict.serverRevision,
    })
    if (conflict.operation.recordDate === reportDate.value) dailyEntries.value = entries
    reportConflict.value = null
    setReportStatus('local')
    await flush()
  }

  const discard = async () => {
    const conflict = reportConflict.value
    if (!conflict) return
    await discardReportOperation(conflict.operation.userId, conflict.operation.recordDate)
    if (conflict.operation.recordDate === reportDate.value) {
      setBaseEntries(conflict.serverEntries)
      dailyEntries.value = normalizeReportEntries(conflict.serverEntries)
      reportRevision.value = Number(conflict.serverRevision || 0)
      applyReportStatus(conflict.serverStatus)
    }
    reportConflict.value = null
    setReportStatus('idle')
  }

  const cleanup = () => {
    if (retryTimer) clearTimeout(retryTimer)
    if (listenersAttached && typeof window !== 'undefined') {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      listenersAttached = false
    }
  }

  return { attach, flush, queueCurrent, retry, resolve, discard, showConflict, cleanup }
}
