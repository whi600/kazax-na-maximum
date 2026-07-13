import { ref } from 'vue'

export const useAppDataLoader = ({ loadReportData, authMessage }) => {
  const appLoading = ref(false)
  const reportAutosaveSuppressed = ref(false)

  const fetchAppData = async () => {
    appLoading.value = true
    authMessage.value = ''
    reportAutosaveSuppressed.value = true
    try {
      await loadReportData()
    } catch (error) {
      authMessage.value = error?.message || 'Не удалось загрузить данные'
    } finally {
      reportAutosaveSuppressed.value = false
      appLoading.value = false
    }
  }

  return { appLoading, reportAutosaveSuppressed, fetchAppData }
}
