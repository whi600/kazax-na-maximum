import { computed, ref } from 'vue'
import { shiftsApi } from '../../../api'
import {
  addDays,
  createDefaultWeekTemplate,
  DEFAULT_WEEK_TEMPLATE_SHIFTS,
  getCurrentWeekStart,
  getNextWeekStart,
  getWeekStart,
  isPastDate,
  parseDate,
  toDateKey,
} from '../../../scheduleUtils'

const DEFAULT_WEEKS_BOOTSTRAP_KEY = 'kofeyny:default-weeks-bootstrap:v1'

export const useScheduleData = ({ canManageSchedule, isCurrentUserShift, safeAlert }) => {
  const shifts = ref([])
  const loading = ref(true)
  const scheduleTemplateShifts = ref([])
  const selectedWeekStart = ref('')
  const pendingDeleteIds = ref([])
  const unsavedNewShifts = ref([])
  const recentNewShiftIds = ref([])
  const dismissedNewShiftIds = ref([])
  let tempShiftSeq = 0

  const hasBootstrappedDefaultWeeks = () => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(DEFAULT_WEEKS_BOOTSTRAP_KEY) === '1'
  }

  const markDefaultWeeksBootstrapped = () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DEFAULT_WEEKS_BOOTSTRAP_KEY, '1')
  }

  const makeTempShift = ({ date, start_time, end_time }) => ({
    id: -(Date.now() + tempShiftSeq++),
    date,
    start_time,
    end_time,
    status: 'approved',
    employee_name: null,
  })

  const isNewShift = (shift) => {
    const id = Number(shift?.id)
    if (!Number.isFinite(id) || dismissedNewShiftIds.value.includes(id)) return false
    return id < 0 || recentNewShiftIds.value.includes(id)
  }

  const markShiftInteracted = (shift) => {
    const id = Number(shift?.id)
    if (!Number.isFinite(id) || dismissedNewShiftIds.value.includes(id)) return
    dismissedNewShiftIds.value = [...dismissedNewShiftIds.value, id]
  }

  const loadScheduleTemplate = async () => {
    try {
      const response = await shiftsApi.template()
      scheduleTemplateShifts.value = response.shifts || []
    } catch {
      scheduleTemplateShifts.value = DEFAULT_WEEK_TEMPLATE_SHIFTS
    }
  }

  const fetchShifts = async ({
    preserveDrafts = false,
    skipDefaultBootstrap = false,
    setSuppressAutosave,
  } = {}) => {
    setSuppressAutosave?.(true)
    try {
      const previousWeekStart = selectedWeekStart.value
      const response = await shiftsApi.upcoming()
      shifts.value = response.shifts || []

      const approvedServerShifts = shifts.value.filter(
        (shift) => (shift.status || 'approved') === 'approved',
      )

      if (
        canManageSchedule.value &&
        approvedServerShifts.length === 0 &&
        !skipDefaultBootstrap &&
        !hasBootstrappedDefaultWeeks()
      ) {
        const currentWeek = getCurrentWeekStart()
        const nextWeek = getNextWeekStart(currentWeek)
        const defaults = [
          ...createDefaultWeekTemplate(currentWeek, scheduleTemplateShifts.value),
          ...createDefaultWeekTemplate(nextWeek, scheduleTemplateShifts.value),
        ]

        await shiftsApi.bulkSave({
          deletedIds: [],
          newShifts: defaults,
        })

        markDefaultWeeksBootstrapped()
        const refreshed = await shiftsApi.upcoming()
        shifts.value = refreshed.shifts || []
      } else if (approvedServerShifts.length > 0) {
        markDefaultWeeksBootstrapped()
      }

      const currentWeekStart = getCurrentWeekStart()
      const availableWeeks = Array.from(
        new Set(
          shifts.value
            .filter((shift) => (shift.status || 'approved') === 'approved')
            .map((shift) => getWeekStart(shift.date))
            .filter((weekStart) => weekStart >= currentWeekStart),
        ),
      ).sort()

      const firstApprovedShift = shifts.value
        .filter((shift) => (shift.status || 'approved') === 'approved')
        .sort((a, b) =>
          `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`),
        )[0]

      if (previousWeekStart && availableWeeks.includes(previousWeekStart)) {
        selectedWeekStart.value = previousWeekStart
      } else if (firstApprovedShift) {
        selectedWeekStart.value = getWeekStart(firstApprovedShift.date)
      } else {
        selectedWeekStart.value = currentWeekStart
      }

      if (!preserveDrafts) {
        pendingDeleteIds.value = []
        unsavedNewShifts.value = []
      }
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки смен')
    } finally {
      setSuppressAutosave?.(false)
    }
  }

  const approvedShifts = computed(() => {
    const all = [
      ...shifts.value.filter(
        (shift) =>
          (shift.status || 'approved') === 'approved' &&
          !pendingDeleteIds.value.includes(shift.id),
      ),
      ...unsavedNewShifts.value,
    ]

    return all.sort((a, b) => {
      const aTime = new Date(`${a.date}T${a.start_time}`)
      const bTime = new Date(`${b.date}T${b.start_time}`)
      return aTime - bTime
    })
  })

  const groupedShifts = computed(() => {
    const groups = {}

    approvedShifts.value.forEach((shift) => {
      if (!groups[shift.date]) groups[shift.date] = []
      groups[shift.date].push(shift)
    })

    return groups
  })

  const weekStarts = computed(() => {
    const currentWeekStart = getCurrentWeekStart()
    const starts = new Set([currentWeekStart])

    approvedShifts.value.forEach((shift) => {
      const weekStart = getWeekStart(shift.date)
      if (weekStart >= currentWeekStart) starts.add(weekStart)
    })

    return Array.from(starts).sort()
  })

  const selectedWeekDays = computed(() => {
    const weekStart = selectedWeekStart.value || weekStarts.value[0] || getCurrentWeekStart()
    const start = parseDate(weekStart)

    return Array.from({ length: 7 }, (_, index) => {
      const date = toDateKey(addDays(start, index))
      const dayShifts = groupedShifts.value[date] || []
      const occupiedCount = dayShifts.filter((shift) => shift.employee_name).length

      return {
        date,
        isPast: isPastDate(date),
        shifts: dayShifts,
        occupiedCount,
        openCount: dayShifts.length - occupiedCount,
      }
    })
  })

  const selectedWeekStats = computed(() => {
    const shiftsCount = selectedWeekDays.value.reduce(
      (sum, day) => sum + day.shifts.length,
      0,
    )
    const openCount = selectedWeekDays.value.reduce((sum, day) => sum + day.openCount, 0)
    const myCount = selectedWeekDays.value.reduce(
      (sum, day) =>
        sum +
        day.shifts.filter((shift) => isCurrentUserShift(shift)).length,
      0,
    )

    return { shiftsCount, openCount, myCount }
  })

  const pendingRequests = computed(() =>
    shifts.value.filter((shift) => (shift.status || 'approved') === 'pending'),
  )

  const initializeScheduleData = async ({ resolveUserName, setSuppressAutosave }) => {
    loading.value = true
    resolveUserName()
    await loadScheduleTemplate()
    await fetchShifts({ setSuppressAutosave })
    loading.value = false
  }

  return {
    shifts,
    loading,
    scheduleTemplateShifts,
    selectedWeekStart,
    pendingDeleteIds,
    unsavedNewShifts,
    recentNewShiftIds,
    dismissedNewShiftIds,
    approvedShifts,
    weekStarts,
    selectedWeekDays,
    selectedWeekStats,
    pendingRequests,
    makeTempShift,
    isNewShift,
    markShiftInteracted,
    markDefaultWeeksBootstrapped,
    fetchShifts,
    initializeScheduleData,
  }
}
