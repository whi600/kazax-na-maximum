import { useDailyReportState } from './useDailyReportState'
import { useProductsState } from './useProductsState'

export const useReportState = ({ canManageProducts, currentUser }) => {
  const dailyReport = useDailyReportState({ currentUser })
  const productState = useProductsState({
    canManageProducts,
    onProductRemoved: (productId) => {
      dailyReport.dailyEntries.value = dailyReport.dailyEntries.value.filter(
        (entry) => entry.product_id !== productId,
      )
    },
  })

  const loadReportData = () => Promise.all([
    productState.loadProducts(),
    dailyReport.loadDailyReport(),
  ])

  const clearReportState = () => {
    productState.clearProductsState()
    dailyReport.clearDailyReportState()
  }

  const cleanupReportTimers = () => {
    dailyReport.cleanupDailyReport()
  }

  const applyAssistantActions = async (actions) => {
    if (
      !dailyReport.reportCanEditToday.value ||
      (dailyReport.reportCompleted.value && !dailyReport.reportCanOverrideCompletion.value)
    ) {
      return 0
    }

    let changed = 0
    for (const action of Array.isArray(actions) ? actions : []) {
      if (action?.type !== 'set_remainder') continue

      const productId = Number(action.productId)
      const remainder = Number(action.remainder)
      if (!Number.isInteger(productId) || !Number.isFinite(remainder) || remainder < 0) continue

      const product = productState.products.value.find((item) => item.id === productId)
      if (!product) continue

      let entry = dailyReport.dailyEntries.value.find((item) => item.product_id === productId)
      if (!entry) {
        dailyReport.onAddProduct(product)
        entry = dailyReport.dailyEntries.value.find((item) => item.product_id === productId)
      }
      if (!entry || entry.remainder === remainder) continue

      entry.remainder = remainder
      changed += 1
    }

    if (changed) await dailyReport.saveReport({ silent: true })
    return changed
  }

  return {
    ...productState,
    ...dailyReport,
    loadReportData,
    applyAssistantActions,
    clearReportState,
    cleanupReportTimers,
  }
}
