import { computed, ref } from 'vue'
import { recordsApi } from '../../../api'
import { buildAuditTimeline } from '../../../audit/auditPresentation'

const PAGE_SIZE = 30

const getErrorMessage = (error) => error?.message || 'Не удалось загрузить журнал изменений'

export const useAuditLog = () => {
  const logs = ref([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref('')
  const hasMore = ref(false)
  const offset = ref(0)

  const entries = computed(() => buildAuditTimeline(logs.value))

  const load = async ({ reset = false } = {}) => {
    if (loading.value || loadingMore.value) return

    if (reset) {
      loading.value = true
      error.value = ''
      logs.value = []
      offset.value = 0
      hasMore.value = false
    } else {
      if (!hasMore.value) return
      loadingMore.value = true
    }

    try {
      const response = await recordsApi.audit({ limit: PAGE_SIZE, offset: offset.value })
      const pageLogs = Array.isArray(response.logs) ? response.logs : []
      logs.value.push(...pageLogs)
      offset.value += pageLogs.length
      hasMore.value = Boolean(response.hasMore)
    } catch (requestError) {
      error.value = getErrorMessage(requestError)
    } finally {
      loading.value = false
      loadingMore.value = false
    }
  }

  const reload = () => load({ reset: true })

  return {
    entries,
    error,
    hasMore,
    loading,
    loadingMore,
    loadMore: load,
    reload,
  }
}
