import { computed, ref } from 'vue'
import { recordsApi } from '../api'

const REPORT_DRAFT_PREFIX = 'kofeyny:daily-report-draft:v2'

const getFallbackDateKey = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeReportNumber = (value) => {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeDraftEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      product_id: entry.product_id,
      name: entry.name,
      category: entry.category || 'other',
      arrival: normalizeReportNumber(entry.arrival),
      remainder: normalizeReportNumber(entry.remainder),
      write_off: normalizeReportNumber(entry.write_off),
    }))
    .filter((entry) => Number.isFinite(Number(entry.product_id)))

export const useReportState = ({ canManageProducts, currentUser }) => {
  const products = ref([])
  const dailyEntries = ref([])
  const reportDate = ref('')
  const reportCanEditToday = ref(false)
  const reportCompleted = ref(false)
  const reportCompletedAt = ref(null)
  const reportCompletedByName = ref('')
  const reportCompleting = ref(false)
  const reportSaveStatus = ref('idle')
  const productSaveBusy = ref(false)
  const editingProductId = ref(null)
  const productForm = ref({
    name: '',
    category: 'other',
    unit: 'шт',
  })
  let reportAutosaveTimer = null
  let reportStatusHideTimer = null

  const getReportDraftKey = () => {
    const date = reportDate.value || getFallbackDateKey()
    const userId = currentUser?.value?.id || 'anonymous'
    return `${REPORT_DRAFT_PREFIX}:${userId}:${date}`
  }

  const readLocalReportDraft = () => {
    if (typeof window === 'undefined') return null

    try {
      const raw = window.localStorage.getItem(getReportDraftKey())
      if (!raw) return null
      const draft = JSON.parse(raw)
      if (!Array.isArray(draft?.entries)) return null
      return {
        ...draft,
        entries: normalizeDraftEntries(draft.entries),
      }
    } catch {
      return null
    }
  }

  const persistLocalReportDraft = () => {
    if (typeof window === 'undefined') return false

    try {
      window.localStorage.setItem(
        getReportDraftKey(),
        JSON.stringify({
          status: 'pending',
          recordDate: reportDate.value || getFallbackDateKey(),
          updatedAt: new Date().toISOString(),
          entries: normalizeDraftEntries(dailyEntries.value),
        }),
      )
      return true
    } catch {
      return false
    }
  }

  const clearLocalReportDraft = () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(getReportDraftKey())
  }

  const resetProductForm = () => {
    editingProductId.value = null
    productForm.value = { name: '', category: 'other', unit: 'шт' }
  }

  const updateProductFormField = (field, value) => {
    productForm.value = { ...productForm.value, [field]: value }
  }

  const loadProducts = async () => {
    const productsResponse = await recordsApi.products()
    products.value = productsResponse.products || []
  }

  const loadReportData = async () => {
    const [, todayResponse] = await Promise.all([loadProducts(), recordsApi.today()])
    reportDate.value = todayResponse.recordDate || getFallbackDateKey()
    reportCanEditToday.value = Boolean(todayResponse.canEdit)
    reportCompleted.value = Boolean(todayResponse.reportStatus?.completed)
    reportCompletedAt.value = todayResponse.reportStatus?.completedAt || null
    reportCompletedByName.value = todayResponse.reportStatus?.completedByName || ''
    dailyEntries.value = (todayResponse.entries || []).map((entry) => ({
      product_id: entry.product_id,
      name: entry.name,
      category: entry.category || 'other',
      arrival: entry.arrival ?? null,
      remainder: entry.remainder ?? null,
      write_off: entry.write_off ?? null,
    }))

    const localDraft = readLocalReportDraft()
    if (localDraft?.entries?.length && reportCanEditToday.value && !reportCompleted.value) {
      dailyEntries.value = localDraft.entries
      setReportSaveStatus('error')
    }
  }

  const onAddProduct = (product) => {
    if (!reportCanEditToday.value) return

    if (!dailyEntries.value.find((entry) => entry.product_id === product.id)) {
      dailyEntries.value.unshift({
        product_id: product.id,
        name: product.name,
        category: product.category || 'other',
        arrival: null,
        remainder: null,
        write_off: null,
      })
    }
  }

  const removeReportEntry = (entry) => {
    if (!reportCanEditToday.value) return

    const idx = dailyEntries.value.indexOf(entry)
    if (idx > -1) dailyEntries.value.splice(idx, 1)
  }

  const buildReportPayload = () =>
    dailyEntries.value
      .map((entry) => {
        const arrival =
          entry.arrival !== null && entry.arrival !== '' ? Number(entry.arrival) : 0
        const remainder =
          entry.remainder !== null && entry.remainder !== ''
            ? Number(entry.remainder)
            : 0
        const write_off =
          entry.write_off !== null && entry.write_off !== ''
            ? Number(entry.write_off)
            : 0

        return {
          product_id: entry.product_id,
          arrival: Number.isFinite(arrival) ? arrival : 0,
          remainder: Number.isFinite(remainder) ? remainder : 0,
          write_off: Number.isFinite(write_off) ? write_off : 0,
        }
      })
      .filter((entry) => entry.arrival !== 0 || entry.remainder !== 0 || entry.write_off !== 0)

  const setReportSaveStatus = (status) => {
    reportSaveStatus.value = status
    if (reportStatusHideTimer) clearTimeout(reportStatusHideTimer)

    if (status === 'saved') {
      reportStatusHideTimer = setTimeout(() => {
        reportSaveStatus.value = 'idle'
        reportStatusHideTimer = null
      }, 12000)
    }
  }

  const reportSaveLabel = computed(() => {
    if (reportSaveStatus.value === 'saving') return 'Сохраняется...'
    if (reportSaveStatus.value === 'error') return 'ОШИБКА СОХРАНЕНИЯ'
    if (reportSaveStatus.value === 'saved') return 'Сохранено'
    return ''
  })

  const reportSaveClass = computed(() => {
    if (reportSaveStatus.value === 'saving') return 'bg-blue-50 text-blue-600 border-blue-100'
    if (reportSaveStatus.value === 'error') return 'bg-red-50 text-red-500 border-red-100'
    if (reportSaveStatus.value === 'saved') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
    return 'bg-slate-50 text-slate-400 border-slate-100'
  })

  const saveReport = async ({ silent = false, autosave = false } = {}) => {
    if (!reportCanEditToday.value) return false
    const localDraftSaved = persistLocalReportDraft()
    if (!localDraftSaved) {
      setReportSaveStatus('error')
      if (!silent) {
        alert('Не удалось сохранить черновик на устройстве')
      }
      return false
    }

    if (autosave) {
      setReportSaveStatus('saving')
    }

    try {
      await recordsApi.saveToday(buildReportPayload())
      clearLocalReportDraft()
      reportCompleted.value = false
      reportCompletedAt.value = null
      reportCompletedByName.value = ''
      if (autosave) {
        setReportSaveStatus('saved')
      }
      if (!silent) alert('✅ Сохранено')
      return true
    } catch (error) {
      if (autosave) setReportSaveStatus('error')
      if (!silent) {
        alert('Ошибка: ' + (error?.message || 'Не удалось сохранить отчет'))
      }
      return false
    }
  }

  const retryReportSave = () => saveReport({ silent: true, autosave: true })

  const completeReport = async () => {
    if (!reportCanEditToday.value || reportCompleting.value) return

    reportCompleting.value = true
    try {
      const saved = await saveReport({ silent: true, autosave: true })
      if (!saved) return
      const response = await recordsApi.completeToday()
      reportCompleted.value = Boolean(response.reportStatus?.completed)
      reportCompletedAt.value = response.reportStatus?.completedAt || null
      reportCompletedByName.value = response.reportStatus?.completedByName || ''
      setReportSaveStatus('saved')
    } catch (error) {
      setReportSaveStatus('error')
      alert(error?.message || 'Не удалось отметить отчет готовым')
    } finally {
      reportCompleting.value = false
    }
  }

  const scheduleReportAutosave = ({ currentUser, activeTab }) => {
    if (!currentUser.value || !reportCanEditToday.value) return
    if (activeTab.value !== 'main') return

    if (reportAutosaveTimer) clearTimeout(reportAutosaveTimer)
    reportAutosaveTimer = setTimeout(() => {
      saveReport({ silent: true, autosave: true })
    }, 600)
  }

  const startEditProduct = (product) => {
    editingProductId.value = product.id
    productForm.value = {
      name: product.name || '',
      category: product.category || 'other',
      unit: product.unit || 'шт',
    }
  }

  const saveProduct = async () => {
    if (!canManageProducts.value) return

    const payload = {
      name: String(productForm.value.name || '').trim(),
      category: productForm.value.category || 'other',
      unit: String(productForm.value.unit || '').trim() || 'шт',
    }

    if (!payload.name) {
      alert('Введите название товара')
      return
    }

    productSaveBusy.value = true
    try {
      if (editingProductId.value) {
        await recordsApi.updateProduct(editingProductId.value, payload)
      } else {
        await recordsApi.createProduct(payload)
      }

      await loadProducts()
      resetProductForm()
    } catch (error) {
      alert(error?.message || 'Не удалось сохранить товар')
    } finally {
      productSaveBusy.value = false
    }
  }

  const removeProduct = async (product) => {
    if (!canManageProducts.value) return

    const ok = window.confirm(`Удалить товар "${product.name}"?`)
    if (!ok) return

    productSaveBusy.value = true
    try {
      await recordsApi.deleteProduct(product.id)
      dailyEntries.value = dailyEntries.value.filter(
        (entry) => entry.product_id !== product.id,
      )
      await loadProducts()
      if (editingProductId.value === product.id) {
        resetProductForm()
      }
    } catch (error) {
      alert(error?.message || 'Не удалось удалить товар')
    } finally {
      productSaveBusy.value = false
    }
  }

  const clearReportState = () => {
    products.value = []
    dailyEntries.value = []
    reportDate.value = ''
    reportCanEditToday.value = false
    reportCompleted.value = false
    reportCompletedAt.value = null
    reportCompletedByName.value = ''
    setReportSaveStatus('idle')
    resetProductForm()
  }

  const cleanupReportTimers = () => {
    if (reportAutosaveTimer) clearTimeout(reportAutosaveTimer)
    if (reportStatusHideTimer) clearTimeout(reportStatusHideTimer)
  }

  return {
    products,
    dailyEntries,
    reportCanEditToday,
    reportCompleted,
    reportCompletedAt,
    reportCompletedByName,
    reportCompleting,
    reportSaveLabel,
    reportSaveClass,
    reportSaveStatus,
    productSaveBusy,
    editingProductId,
    productForm,
    resetProductForm,
    updateProductFormField,
    loadReportData,
    onAddProduct,
    removeReportEntry,
    saveReport,
    retryReportSave,
    completeReport,
    scheduleReportAutosave,
    startEditProduct,
    saveProduct,
    removeProduct,
    clearReportState,
    cleanupReportTimers,
  }
}
