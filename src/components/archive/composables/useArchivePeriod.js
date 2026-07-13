import { onBeforeUnmount, ref, watch } from 'vue'
import { recordsApi } from '../../../api'

const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const useArchivePeriod = () => {
  const now = new Date()
  const periodStart = ref(toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)))
  const periodEnd = ref(toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const periodData = ref(null)
  const periodLoading = ref(false)
  let enabled = false
  let timer = null
  let requestId = 0

  const loadPeriod = async () => {
    if (!periodStart.value || !periodEnd.value || periodStart.value > periodEnd.value) return
    const currentRequest = ++requestId
    periodLoading.value = true
    try {
      const response = await recordsApi.archivePeriod({
        start: periodStart.value,
        end: periodEnd.value,
      })
      if (currentRequest === requestId) periodData.value = response
    } catch (error) {
      if (currentRequest === requestId) alert(error?.message || 'Не удалось загрузить период')
    } finally {
      if (currentRequest === requestId) periodLoading.value = false
    }
  }

  const enablePeriod = async () => {
    enabled = true
    await loadPeriod()
  }

  watch([periodStart, periodEnd], () => {
    if (!enabled) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(loadPeriod, 250)
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    periodStart,
    periodEnd,
    periodData,
    periodLoading,
    enablePeriod,
  }
}
