import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { recordsApi, shiftsApi } from '../../api'
import {
  buildRecordsDaySections,
  formatAuditAction,
  formatAuditEntity,
  formatAuditSummary,
  formatDateLabel,
  formatHours,
  formatShiftDay,
  formatShiftWeekday,
  getRecordDateKey,
  parseDate,
  parseShiftHours,
  toDateKey,
} from '../../archiveUtils'

const RECORDS_PAGE_DAYS = 3
const SHIFT_HISTORY_PAGE_SIZE = 10
const AUDIT_PAGE_SIZE = 15
const SHIFT_HOURS_MAX_SIZE = 500
const WRITE_OFF_ANALYTICS_DAYS = 10

export const normalizeArchiveView = (view) => {
  if (view === 'shifts') return 'shiftHistory'
  if (view === 'hours') return 'shiftHours'
  if (view === 'audit') return 'audit'
  if (view === 'writeOffs') return 'writeOffs'
  if (view === 'shiftHistory' || view === 'shiftHours') return view
  return 'records'
}

export const useArchiveData = (props) => {
  const archiveView = ref(normalizeArchiveView(props.lockedMode))
  const recordsHistory = ref({})
  const shifts = ref([])
  const hoursShifts = ref([])
  const auditLogs = ref([])
  const writeOffDays = ref([])
  const writeOffDetails = ref([])
  const selectedWriteOffDate = ref('')

  const recordsLoading = ref(false)
  const shiftsLoading = ref(false)
  const auditLoading = ref(false)
  const analyticsLoading = ref(false)
  const analyticsDetailsLoading = ref(false)
  const recordsLoaded = ref(false)
  const shiftsLoaded = ref(false)
  const hoursLoaded = ref(false)
  const auditLoaded = ref(false)
  const analyticsLoaded = ref(false)
  const recordsHasMore = ref(false)
  const shiftsHasMore = ref(false)
  const auditHasMore = ref(false)
  const recordsOffsetDays = ref(0)
  const shiftsOffset = ref(0)
  const auditOffset = ref(0)

  const selectedEmployee = ref('all')
  const periodStart = ref('')
  const periodEnd = ref('')
  const recordsLoadMoreRef = ref(null)
  const shiftsLoadMoreRef = ref(null)
  const auditLoadMoreRef = ref(null)
  let recordsLoadObserver = null

  const safeAlert = (message) => alert(message)

  const setDefaultPeriod = () => {
    const now = new Date()
    periodStart.value = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
    periodEnd.value = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }

  const baseShifts = computed(() =>
    shifts.value.filter(
      (shift) => (shift.status || 'approved') === 'approved' && shift.employee_name,
    ),
  )

  const employees = computed(() => {
    const stats = new Map()

    baseShifts.value.forEach((shift) => {
      const current = stats.get(shift.employee_name) || 0
      stats.set(shift.employee_name, current + 1)
    })

    return Array.from(stats.entries())
      .map(([name, count]) => ({ key: name, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  })

  const filteredShifts = computed(() =>
    baseShifts.value.filter((shift) => {
      if (!shift?.date || !shift?.employee_name) return false
      if (selectedEmployee.value === 'all') return true
      return shift.employee_name === selectedEmployee.value
    }),
  )

  const groupedShiftHistory = computed(() => {
    const sorted = [...filteredShifts.value].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (a.start_time || '').localeCompare(b.start_time || '')
    })

    const list = []
    const map = new Map()

    sorted.forEach((shift) => {
      if (!shift?.date) return
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(shift.date))) return

      const date = parseDate(shift.date)
      if (Number.isNaN(date.getTime())) return

      const label = date.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      })

      if (!map.has(label)) {
        const group = { label, items: [] }
        map.set(label, group)
        list.push(group)
      }

      map.get(label).items.push(shift)
    })

    return list
  })

  const selectedEmployeeName = computed(() => {
    if (selectedEmployee.value === 'all') return 'Все сотрудники'
    return selectedEmployee.value
  })

  const selectedEmployeeSummary = computed(
    () => `${selectedEmployeeName.value}: ${filteredShifts.value.length} смен`,
  )

  const periodShifts = computed(() =>
    hoursShifts.value
      .filter(
        (shift) => (shift.status || 'approved') === 'approved' && shift.employee_name,
      )
      .filter((shift) => {
      if (periodStart.value && shift.date < periodStart.value) return false
      if (periodEnd.value && shift.date > periodEnd.value) return false
      return true
    }),
  )

  const periodEmployeeStats = computed(() => {
    const stats = new Map()

    periodShifts.value.forEach((shift) => {
      const current = stats.get(shift.employee_name) || {
        name: shift.employee_name,
        shiftsCount: 0,
        hours: 0,
      }

      current.shiftsCount += 1
      current.hours += parseShiftHours(shift)
      stats.set(shift.employee_name, current)
    })

    return Array.from(stats.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ru'),
    )
  })

  const periodTotalHours = computed(() =>
    periodEmployeeStats.value.reduce((sum, employee) => sum + employee.hours, 0),
  )

  const periodLabel = computed(() => {
    if (!periodStart.value && !periodEnd.value) return 'Все даты'
    if (periodStart.value && periodEnd.value) {
      return `${formatDateLabel(periodStart.value)} - ${formatDateLabel(periodEnd.value)}`
    }
    if (periodStart.value) return `С ${formatDateLabel(periodStart.value)}`
    return `До ${formatDateLabel(periodEnd.value)}`
  })

  const archiveTabs = computed(() => {
    const tabs = [
      { key: 'records', label: 'Отчеты' },
      { key: 'shiftHistory', label: 'История' },
      { key: 'shiftHours', label: 'Часы' },
    ]

    if (props.canViewAudit) {
      tabs.push({ key: 'writeOffs', label: 'Списания' })
      tabs.push({ key: 'audit', label: 'Изменения' })
    }

    return tabs
  })

  const archiveViewIndex = computed(() => {
    const index = archiveTabs.value.findIndex((tab) => tab.key === archiveView.value)
    return index >= 0 ? index : 0
  })

  const formatDateTimeLabel = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value || ''
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const recordsDaySections = computed(() => buildRecordsDaySections(recordsHistory.value))

  const maxWriteOffTotal = computed(() =>
    Math.max(...writeOffDays.value.map((day) => Number(day.totalWriteOff || 0)), 1),
  )

  const writeOffChartDays = computed(() =>
    [...writeOffDays.value]
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((day) => ({
        ...day,
        heightPercent: Math.max(
          8,
          Math.round((Number(day.totalWriteOff || 0) / maxWriteOffTotal.value) * 100),
        ),
      })),
  )

  const selectedWriteOffLabel = computed(() =>
    selectedWriteOffDate.value ? formatDateLabel(selectedWriteOffDate.value) : '',
  )

  const hasMoreRecordDays = computed(() => recordsHasMore.value)
  const hasMoreShifts = computed(() => shiftsHasMore.value)
  const hasMoreAudit = computed(() => auditHasMore.value)

  const mergeRecords = (rows) => {
    const grouped = { ...recordsHistory.value }

    rows.forEach((record) => {
        const dateKey = getRecordDateKey(record.created_at)
        if (!dateKey) return
      if (!grouped[dateKey]) grouped[dateKey] = []

      const byProduct = new Map(grouped[dateKey].map((item) => [item.product_id, item]))
      const existing = byProduct.get(record.product_id)
        const existingTime = existing ? new Date(existing.created_at).getTime() : -Infinity
        const currentTime = new Date(record.created_at).getTime()
        if (!existing || currentTime >= existingTime) {
        byProduct.set(record.product_id, record)
        }
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
      const response = await recordsApi.archive({
        limitDays: RECORDS_PAGE_DAYS,
        offsetDays,
      })
      const rows = response.records || []

      if (!append) recordsHistory.value = {}
      mergeRecords(rows)
      recordsHasMore.value = Boolean(response.hasMore)
      recordsOffsetDays.value = offsetDays + Number(response.limitDays || RECORDS_PAGE_DAYS)
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки архива')
    } finally {
      recordsLoading.value = false
      recordsLoaded.value = true
    }
  }

  const loadMoreRecordDays = () => {
    if (!hasMoreRecordDays.value) return
    loadRecords({ append: true })
  }

  const loadMoreShifts = () => {
    if (!hasMoreShifts.value) return
    loadShifts({ append: true })
  }

  const loadMoreAudit = () => {
    if (!hasMoreAudit.value) return
    loadAudit({ append: true })
  }

  const reconnectRecordsObserver = async () => {
    if (recordsLoadObserver) {
      recordsLoadObserver.disconnect()
    }

    if (
      typeof window === 'undefined' ||
      (
        (archiveView.value === 'records' && !hasMoreRecordDays.value) ||
        (archiveView.value === 'shiftHistory' && !hasMoreShifts.value) ||
        (archiveView.value === 'audit' && !hasMoreAudit.value) ||
        (archiveView.value !== 'records' &&
          archiveView.value !== 'shiftHistory' &&
          archiveView.value !== 'audit')
      )
    ) {
      return
    }

    await nextTick()
    const target =
      archiveView.value === 'records'
        ? recordsLoadMoreRef.value
        : archiveView.value === 'shiftHistory'
          ? shiftsLoadMoreRef.value
          : auditLoadMoreRef.value
    if (!target) return

    recordsLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (archiveView.value === 'records') loadMoreRecordDays()
          if (archiveView.value === 'shiftHistory') loadMoreShifts()
          if (archiveView.value === 'audit') loadMoreAudit()
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.1 },
    )

    recordsLoadObserver.observe(target)
  }

  const loadShifts = async ({ append = false } = {}) => {
    if (shiftsLoading.value) return
    shiftsLoading.value = true

    try {
      const offset = append ? shiftsOffset.value : 0
      const response = await shiftsApi.archive({
        limit: SHIFT_HISTORY_PAGE_SIZE,
        offset,
      })
      const rows = (response.shifts || []).filter(
        (shift) => shift?.date && shift?.start_time && shift?.end_time,
      )
      shifts.value = append ? [...shifts.value, ...rows] : rows
      shiftsHasMore.value = Boolean(response.hasMore)
      shiftsOffset.value = offset + Number(response.limit || SHIFT_HISTORY_PAGE_SIZE)
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки смен')
    } finally {
      shiftsLoading.value = false
      shiftsLoaded.value = true
    }
  }

  const loadHoursShifts = async () => {
    if (hoursLoaded.value) return
    shiftsLoading.value = true

    try {
      const response = await shiftsApi.archive({ limit: SHIFT_HOURS_MAX_SIZE, offset: 0 })
      hoursShifts.value = (response.shifts || []).filter(
        (shift) => shift?.date && shift?.start_time && shift?.end_time,
      )
      hoursLoaded.value = true
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки смен')
    } finally {
      shiftsLoading.value = false
    }
  }

  const loadAudit = async ({ append = false } = {}) => {
    if (auditLoading.value) return
    auditLoading.value = true

    try {
      const offset = append ? auditOffset.value : 0
      const response = await recordsApi.audit({ limit: AUDIT_PAGE_SIZE, offset })
      const rows = response.logs || []
      auditLogs.value = append ? [...auditLogs.value, ...rows] : rows
      auditHasMore.value = Boolean(response.hasMore)
      auditOffset.value = offset + rows.length
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки изменений')
    } finally {
      auditLoading.value = false
      auditLoaded.value = true
    }
  }

  const loadWriteOffDetails = async (date) => {
    if (!date) return
    selectedWriteOffDate.value = date
    analyticsDetailsLoading.value = true

    try {
      const response = await recordsApi.writeOffDetails(date)
      writeOffDetails.value = response.items || []
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки списаний')
    } finally {
      analyticsDetailsLoading.value = false
    }
  }

  const loadWriteOffAnalytics = async () => {
    if (analyticsLoading.value) return
    analyticsLoading.value = true

    try {
      const response = await recordsApi.writeOffAnalytics({
        limitDays: WRITE_OFF_ANALYTICS_DAYS,
      })
      writeOffDays.value = response.days || []
      analyticsLoaded.value = true

      const firstDate = writeOffDays.value[0]?.date || ''
      if (firstDate) await loadWriteOffDetails(firstDate)
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки аналитики')
    } finally {
      analyticsLoading.value = false
    }
  }

  watch(archiveView, async (view) => {
    if ((view === 'audit' || view === 'writeOffs') && !props.canViewAudit) {
      archiveView.value = 'records'
      return
    }

    if (view === 'records' && !recordsLoaded.value) {
      await loadRecords()
    }

    if (view === 'shiftHistory' && !shiftsLoaded.value) {
      await loadShifts()
    }

    if (view === 'shiftHours' && !hoursLoaded.value) {
      await loadHoursShifts()
    }

    if (view === 'audit' && props.canViewAudit && !auditLoaded.value) {
      await loadAudit()
    }

    if (view === 'writeOffs' && props.canViewAudit && !analyticsLoaded.value) {
      await loadWriteOffAnalytics()
    }

    await reconnectRecordsObserver()
  })

  watch(
    () => props.canViewAudit,
    (canViewAudit) => {
      if (!canViewAudit && (archiveView.value === 'audit' || archiveView.value === 'writeOffs')) {
        archiveView.value = 'records'
      }
    },
  )

  watch(recordsDaySections, reconnectRecordsObserver)
  watch(groupedShiftHistory, reconnectRecordsObserver)
  watch(auditLogs, reconnectRecordsObserver)
  watch(hasMoreRecordDays, reconnectRecordsObserver)
  watch(hasMoreShifts, reconnectRecordsObserver)
  watch(hasMoreAudit, reconnectRecordsObserver)

  onMounted(async () => {
    setDefaultPeriod()
    await loadRecords()
    if (props.lockedMode) {
      archiveView.value = normalizeArchiveView(props.lockedMode)
    }
    if (!props.canViewAudit && archiveView.value === 'audit') {
      archiveView.value = 'records'
    }
    await reconnectRecordsObserver()
  })

  onBeforeUnmount(() => {
    if (recordsLoadObserver) {
      recordsLoadObserver.disconnect()
    }
  })

  return {
    archiveView,
    recordsLoading,
    shiftsLoading,
    auditLoading,
    analyticsLoading,
    analyticsDetailsLoading,
    selectedEmployee,
    periodStart,
    periodEnd,
    recordsLoadMoreRef,
    shiftsLoadMoreRef,
    auditLoadMoreRef,
    baseShifts,
    employees,
    groupedShiftHistory,
    selectedEmployeeSummary,
    periodShifts,
    periodEmployeeStats,
    periodTotalHours,
    periodLabel,
    archiveTabs,
    archiveViewIndex,
    recordsDaySections,
    hasMoreRecordDays,
    hasMoreShifts,
    hasMoreAudit,
    auditLogs,
    writeOffChartDays,
    writeOffDetails,
    selectedWriteOffDate,
    selectedWriteOffLabel,
    loadWriteOffDetails,
    formatDateTimeLabel,
    formatAuditAction,
    formatAuditEntity,
    formatAuditSummary,
    formatDateLabel,
    formatHours,
    formatShiftDay,
    formatShiftWeekday,
  }
}
