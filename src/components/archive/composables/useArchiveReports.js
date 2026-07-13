import { computed, ref } from 'vue'
import { recordsApi } from '../../../api'
import { buildRecordsDaySections, getRecordDateKey } from '../../../archiveUtils'

const PAGE_DAYS = 3

export const useArchiveReports = () => {
  const recordsHistory = ref({})
  const recordsLoading = ref(false)
  const recordsLoaded = ref(false)
  const hasMoreRecordDays = ref(false)
  const recordsOffsetDays = ref(0)

  const recordsDaySections = computed(() =>
    buildRecordsDaySections(recordsHistory.value),
  )

  const mergeRecords = (rows) => {
    const grouped = { ...recordsHistory.value }
    rows.forEach((record) => {
      const dateKey = getRecordDateKey(record.created_at)
      if (!dateKey) return
      const byProduct = new Map(
        (grouped[dateKey] || []).map((item) => [item.product_id, item]),
      )
      const existing = byProduct.get(record.product_id)
      const existingTime = existing ? new Date(existing.created_at).getTime() : -Infinity
      const currentTime = new Date(record.created_at).getTime()
      if (!existing || currentTime >= existingTime) byProduct.set(record.product_id, record)
      grouped[dateKey] = Array.from(byProduct.values()).sort((a, b) =>
        (a.products?.name || '').localeCompare(b.products?.name || '', 'ru'),
      )
    })
    recordsHistory.value = grouped
  }

  const loadRecords = async ({ append = false } = {}) => {
    if (recordsLoading.value) return
    recordsLoading.value = true
    try {
      const offsetDays = append ? recordsOffsetDays.value : 0
      const response = await recordsApi.archive({ limitDays: PAGE_DAYS, offsetDays })
      if (!append) recordsHistory.value = {}
      mergeRecords(response.records || [])
      hasMoreRecordDays.value = Boolean(response.hasMore)
      recordsOffsetDays.value = offsetDays + Number(response.limitDays || PAGE_DAYS)
      recordsLoaded.value = true
    } catch (error) {
      alert(error?.message || 'Ошибка загрузки архива')
    } finally {
      recordsLoading.value = false
    }
  }

  const loadMoreRecordDays = () => {
    if (hasMoreRecordDays.value) loadRecords({ append: true })
  }

  return {
    recordsLoading,
    recordsLoaded,
    recordsDaySections,
    hasMoreRecordDays,
    loadRecords,
    loadMoreRecordDays,
  }
}
