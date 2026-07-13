import { computed, ref } from 'vue'
import { recordsApi } from '../../../api'
import { formatDateLabel, formatShortDate } from '../../../archiveUtils'

const PAGE_DAYS = 10

export const useArchiveWriteOffs = () => {
  const days = ref([])
  const details = ref([])
  const selectedDate = ref('')
  const loading = ref(false)
  const detailsLoading = ref(false)
  const loaded = ref(false)
  const hasMore = ref(false)
  const offsetDays = ref(0)

  const maxTotal = computed(() =>
    Math.max(...days.value.map((day) => Number(day.totalWriteOff || 0)), 1),
  )
  const chartDays = computed(() =>
    [...days.value]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((day) => ({
        ...day,
        dateLabel: formatShortDate(day.date),
        heightPercent: Math.max(
          8,
          Math.round((Number(day.totalWriteOff || 0) / maxTotal.value) * 100),
        ),
      })),
  )
  const selectedLabel = computed(() =>
    selectedDate.value ? formatDateLabel(selectedDate.value) : '',
  )

  const loadDetails = async (date) => {
    if (!date) return
    selectedDate.value = date
    detailsLoading.value = true
    try {
      const response = await recordsApi.writeOffDetails(date)
      details.value = response.items || []
    } catch (error) {
      alert(error?.message || 'Ошибка загрузки списаний')
    } finally {
      detailsLoading.value = false
    }
  }

  const load = async ({ append = false } = {}) => {
    if (loading.value) return
    loading.value = true
    try {
      const offset = append ? offsetDays.value : 0
      const response = await recordsApi.writeOffAnalytics({
        limitDays: PAGE_DAYS,
        offsetDays: offset,
      })
      const rows = response.days || []
      days.value = append ? [...days.value, ...rows] : rows
      hasMore.value = Boolean(response.hasMore)
      offsetDays.value = offset + Number(response.limitDays || PAGE_DAYS)
      loaded.value = true
      const firstDate = selectedDate.value || days.value[0]?.date
      if (firstDate && (!selectedDate.value || !append)) await loadDetails(firstDate)
    } catch (error) {
      alert(error?.message || 'Ошибка загрузки аналитики')
    } finally {
      loading.value = false
    }
  }

  const loadMore = () => {
    if (hasMore.value && !loading.value) load({ append: true })
  }

  return {
    loading,
    detailsLoading,
    loaded,
    chartDays,
    details,
    selectedDate,
    selectedLabel,
    hasMore,
    load,
    loadDetails,
    loadMore,
  }
}
