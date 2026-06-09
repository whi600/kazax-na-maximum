import { computed, ref } from 'vue'
import { recordsApi } from '../api'

export const useReportState = ({ canEditReport, canManageProducts }) => {
  const products = ref([])
  const dailyEntries = ref([])
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
    dailyEntries.value = (todayResponse.entries || []).map((entry) => ({
      product_id: entry.product_id,
      name: entry.name,
      category: entry.category || 'other',
      arrival: entry.arrival ?? null,
      remainder: entry.remainder ?? null,
      write_off: entry.write_off ?? null,
    }))
  }

  const onAddProduct = (product) => {
    if (!canEditReport.value) return

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
    if (!canEditReport.value) return

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

    if (status === 'saved' || status === 'error') {
      reportStatusHideTimer = setTimeout(() => {
        reportSaveStatus.value = 'idle'
        reportStatusHideTimer = null
      }, 12000)
    }
  }

  const reportSaveLabel = computed(() => {
    if (reportSaveStatus.value === 'saving') return 'Сохраняется...'
    if (reportSaveStatus.value === 'error') return 'Ошибка сохранения'
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
    if (!canEditReport.value) return

    if (autosave) {
      setReportSaveStatus('saving')
    }

    try {
      await recordsApi.saveToday(buildReportPayload())
      if (autosave) {
        setReportSaveStatus('saved')
      }
      if (!silent) alert('✅ Сохранено')
    } catch (error) {
      if (autosave) setReportSaveStatus('error')
      if (!silent) {
        alert('Ошибка: ' + (error?.message || 'Не удалось сохранить отчет'))
      }
    }
  }

  const scheduleReportAutosave = ({ currentUser, activeTab }) => {
    if (!currentUser.value || !canEditReport.value) return
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
    reportSaveLabel,
    reportSaveClass,
    productSaveBusy,
    editingProductId,
    productForm,
    resetProductForm,
    updateProductFormField,
    loadReportData,
    onAddProduct,
    removeReportEntry,
    saveReport,
    scheduleReportAutosave,
    startEditProduct,
    saveProduct,
    removeProduct,
    clearReportState,
    cleanupReportTimers,
  }
}
