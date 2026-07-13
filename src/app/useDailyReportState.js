import { ref } from 'vue'
import { recordsApi } from '../api'
import { getReportOperation, migrateLegacyReportDraft } from '../offline/reportOutbox'
import { normalizeReportEntries } from '../report/reportEntries'
import { createReportSyncManager } from '../report/reportSyncManager'
import { useReportSaveStatus } from '../report/useReportSaveStatus'

const getLocalDateKey = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const useDailyReportState = ({ currentUser }) => {
  const dailyEntries = ref([])
  const reportDate = ref('')
  const reportRevision = ref(0)
  const reportCanEditToday = ref(false)
  const reportCompleted = ref(false)
  const reportCompletedAt = ref(null)
  const reportCompletedByName = ref('')
  const reportCompleting = ref(false)
  const reportConflict = ref(null)
  const {
    reportSaveStatus,
    reportSaveLabel,
    reportSaveClass,
    setReportStatus,
    cleanupReportStatus,
  } = useReportSaveStatus()
  let baseEntries = []
  let autosaveTimer = null

  const applyReportStatus = (status) => {
    reportCompleted.value = Boolean(status?.completed)
    reportCompletedAt.value = status?.completedAt || null
    reportCompletedByName.value = status?.completedByName || ''
  }

  const sync = createReportSyncManager({
    currentUser,
    dailyEntries,
    reportDate,
    reportRevision,
    reportConflict,
    getBaseEntries: () => baseEntries,
    setBaseEntries: (entries) => {
      baseEntries = normalizeReportEntries(entries)
    },
    applyReportStatus,
    setReportStatus,
  })

  const restoreLocalOperation = async () => {
    if (!reportCanEditToday.value || reportCompleted.value) return
    await migrateLegacyReportDraft({
      userId: currentUser.value?.id,
      recordDate: reportDate.value,
      baseEntries,
      baseRevision: reportRevision.value,
    })
    const operation = await getReportOperation(currentUser.value?.id, reportDate.value)
    if (!operation) return

    dailyEntries.value = normalizeReportEntries(operation.entries)
    if (operation.status === 'conflict') sync.showConflict(operation)
    else setReportStatus(operation.status === 'error' ? 'error' : 'pending')
  }

  const loadDailyReport = async () => {
    const response = await recordsApi.today()
    reportDate.value = response.recordDate || getLocalDateKey()
    reportRevision.value = Number(response.revision || 0)
    reportCanEditToday.value = Boolean(response.canEdit)
    applyReportStatus(response.reportStatus)
    baseEntries = normalizeReportEntries(response.entries)
    dailyEntries.value = normalizeReportEntries(response.entries)
    sync.attach()
    await restoreLocalOperation()
    sync.flush()
  }

  const onAddProduct = (product) => {
    if (!reportCanEditToday.value) return
    if (dailyEntries.value.some((entry) => entry.product_id === product.id)) return
    dailyEntries.value.unshift({
      product_id: product.id,
      name: product.name,
      category: product.category || 'other',
      unit: product.unit || 'шт',
      arrival: null,
      remainder: null,
      write_off: null,
    })
  }

  const removeReportEntry = (entry) => {
    if (!reportCanEditToday.value) return
    const index = dailyEntries.value.indexOf(entry)
    if (index >= 0) dailyEntries.value.splice(index, 1)
  }

  const saveReport = async ({ silent = false } = {}) => {
    if (!reportCanEditToday.value) return false
    try {
      await sync.queueCurrent(false)
      setReportStatus('local')
      await sync.flush()
      const pending = await getReportOperation(currentUser.value?.id, reportDate.value)
      if (!silent && !pending) alert('Сохранено')
      return !pending
    } catch (error) {
      setReportStatus('error')
      if (!silent) alert(error?.message || 'Не удалось сохранить отчет на устройстве')
      return false
    }
  }

  const completeReport = async () => {
    if (!reportCanEditToday.value || reportCompleting.value) return
    reportCompleting.value = true
    try {
      await sync.queueCurrent(true)
      setReportStatus('local')
      await sync.flush()
    } catch (error) {
      setReportStatus('error')
      alert(error?.message || 'Не удалось сохранить статус отчета на устройстве')
    } finally {
      reportCompleting.value = false
    }
  }

  const scheduleReportAutosave = ({ currentUser: user, activeTab }) => {
    if (!user.value || !reportCanEditToday.value || activeTab.value !== 'main') return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => saveReport({ silent: true }), 600)
  }

  const clearDailyReportState = () => {
    dailyEntries.value = []
    reportDate.value = ''
    reportRevision.value = 0
    reportCanEditToday.value = false
    applyReportStatus(null)
    reportConflict.value = null
    setReportStatus('idle')
  }

  const cleanupDailyReport = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    sync.cleanup()
    cleanupReportStatus()
  }

  return {
    dailyEntries,
    reportCanEditToday,
    reportCompleted,
    reportCompletedAt,
    reportCompletedByName,
    reportCompleting,
    reportSaveStatus,
    reportSaveLabel,
    reportSaveClass,
    reportConflict,
    loadDailyReport,
    onAddProduct,
    removeReportEntry,
    saveReport,
    retryReportSave: sync.retry,
    completeReport,
    resolveReportConflicts: sync.resolve,
    discardLocalReportConflict: sync.discard,
    scheduleReportAutosave,
    clearDailyReportState,
    cleanupDailyReport,
  }
}
