import { computed, ref } from 'vue'
import { recordsApi } from '../../../api'
import { buildRecordsDaySections } from '../../../archiveUtils'

const toMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const toDateKey = (date) =>
  `${toMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`

export const useArchiveCalendar = () => {
  const month = ref(toMonthKey(new Date()))
  const monthDays = ref([])
  const calendarLoading = ref(false)
  const selectedDate = ref('')
  const dayData = ref(null)
  const dayLoading = ref(false)
  let monthRequest = 0
  let dayRequest = 0

  const monthLabel = computed(() => {
    const [year, monthNumber] = month.value.split('-').map(Number)
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
    })
  })

  const calendarCells = computed(() => {
    const [year, monthNumber] = month.value.split('-').map(Number)
    const first = new Date(year, monthNumber - 1, 1)
    const daysCount = new Date(year, monthNumber, 0).getDate()
    const leading = (first.getDay() + 6) % 7
    const events = new Map(monthDays.value.map((day) => [day.date, day]))
    const cells = Array.from({ length: leading }, (_, index) => ({
      key: `before-${index}`,
      empty: true,
    }))
    for (let day = 1; day <= daysCount; day += 1) {
      const date = toDateKey(new Date(year, monthNumber - 1, day))
      cells.push({
        key: date,
        date,
        day,
        empty: false,
        isToday: date === toDateKey(new Date()),
        ...(events.get(date) || {}),
      })
    }
    return cells
  })

  const daySections = computed(() => {
    if (!dayData.value?.records?.length || !selectedDate.value) return []
    return buildRecordsDaySections({ [selectedDate.value]: dayData.value.records })
  })

  const loadMonth = async () => {
    const requestId = ++monthRequest
    calendarLoading.value = true
    try {
      const response = await recordsApi.archiveCalendar(month.value)
      if (requestId === monthRequest) monthDays.value = response.days || []
    } catch (error) {
      if (requestId === monthRequest) alert(error?.message || 'Не удалось загрузить календарь')
    } finally {
      if (requestId === monthRequest) calendarLoading.value = false
    }
  }

  const changeMonth = async (offset) => {
    const [year, monthNumber] = month.value.split('-').map(Number)
    month.value = toMonthKey(new Date(year, monthNumber - 1 + offset, 1))
    await loadMonth()
  }

  const loadDay = async (date) => {
    if (!date) return false
    const requestId = ++dayRequest
    selectedDate.value = date
    dayLoading.value = true
    try {
      const response = await recordsApi.archiveDay(date)
      if (requestId === dayRequest) dayData.value = response
      return requestId === dayRequest
    } catch (error) {
      if (requestId === dayRequest) alert(error?.message || 'Не удалось загрузить день')
      return false
    } finally {
      if (requestId === dayRequest) dayLoading.value = false
    }
  }

  return {
    month,
    monthLabel,
    calendarCells,
    calendarLoading,
    selectedDate,
    dayData,
    daySections,
    dayLoading,
    loadMonth,
    changeMonth,
    loadDay,
  }
}
