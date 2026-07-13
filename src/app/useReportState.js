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

  return {
    ...productState,
    ...dailyReport,
    loadReportData,
    clearReportState,
    cleanupReportTimers,
  }
}
