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

export const normalizeArchiveView = (view) => {
  if (view === 'shifts') return 'shiftHistory'
  if (view === 'hours') return 'shiftHours'
  if (view === 'audit') return 'audit'
  if (view === 'shiftHistory' || view === 'shiftHours') return view
  return 'records'
}

export const useArchiveData = (props) => {
  const archiveView = ref(normalizeArchiveView(props.lockedMode))
  const recordsHistory = ref({})
  const shifts = ref([])
  const auditLogs = ref([])

  const recordsLoading = ref(false)
  const shiftsLoading = ref(false)
  const auditLoading = ref(false)
  const recordsLoaded = ref(false)
  const shiftsLoaded = ref(false)
  const auditLoaded = ref(false)

  const selectedEmployee = ref('all')
  const periodStart = ref('')
  const periodEnd = ref('')
  const visibleRecordDays = ref(5)
  const recordsLoadMoreRef = ref(null)
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
    baseShifts.value.filter((shift) => {
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

  const visibleRecordsDaySections = computed(() =>
    recordsDaySections.value.slice(0, visibleRecordDays.value),
  )

  const hasMoreRecordDays = computed(
    () => visibleRecordsDaySections.value.length < recordsDaySections.value.length,
  )

  const loadRecords = async () => {
    recordsLoading.value = true

    try {
      const response = await recordsApi.archive()
      const rows = response.records || []
      const grouped = {}

      rows.forEach((record) => {
        const dateKey = getRecordDateKey(record.created_at)
        if (!dateKey) return
        if (!grouped[dateKey]) grouped[dateKey] = new Map()

        const existing = grouped[dateKey].get(record.product_id)
        const existingTime = existing ? new Date(existing.created_at).getTime() : -Infinity
        const currentTime = new Date(record.created_at).getTime()
        if (!existing || currentTime >= existingTime) {
          grouped[dateKey].set(record.product_id, record)
        }
      })

      const normalized = {}
      Object.entries(grouped).forEach(([dateKey, byProduct]) => {
        normalized[dateKey] = Array.from(byProduct.values()).sort((a, b) =>
          (a.products?.name || '').localeCompare(b.products?.name || '', 'ru'),
        )
      })

      recordsHistory.value = normalized
      visibleRecordDays.value = 5
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки архива')
    } finally {
      recordsLoading.value = false
      recordsLoaded.value = true
    }
  }

  const loadMoreRecordDays = () => {
    if (!hasMoreRecordDays.value) return
    visibleRecordDays.value = Math.min(
      visibleRecordDays.value + 5,
      recordsDaySections.value.length,
    )
  }

  const reconnectRecordsObserver = async () => {
    if (recordsLoadObserver) {
      recordsLoadObserver.disconnect()
    }

    if (
      typeof window === 'undefined' ||
      archiveView.value !== 'records' ||
      !hasMoreRecordDays.value
    ) {
      return
    }

    await nextTick()
    if (!recordsLoadMoreRef.value) return

    recordsLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRecordDays()
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.1 },
    )

    recordsLoadObserver.observe(recordsLoadMoreRef.value)
  }

  const loadShifts = async () => {
    shiftsLoading.value = true

    try {
      const response = await shiftsApi.archive()
      shifts.value = (response.shifts || []).filter(
        (shift) => shift?.date && shift?.start_time && shift?.end_time,
      )
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки смен')
    } finally {
      shiftsLoading.value = false
      shiftsLoaded.value = true
    }
  }

  const loadAudit = async () => {
    auditLoading.value = true

    try {
      const response = await recordsApi.audit({ limit: 200, offset: 0 })
      auditLogs.value = response.logs || []
    } catch (error) {
      safeAlert(error?.message || 'Ошибка загрузки изменений')
    } finally {
      auditLoading.value = false
      auditLoaded.value = true
    }
  }

  watch(archiveView, async (view) => {
    if (view === 'audit' && !props.canViewAudit) {
      archiveView.value = 'records'
      return
    }

    if (view === 'records' && !recordsLoaded.value) {
      await loadRecords()
    }

    if ((view === 'shiftHistory' || view === 'shiftHours') && !shiftsLoaded.value) {
      await loadShifts()
    }

    if (view === 'audit' && props.canViewAudit && !auditLoaded.value) {
      await loadAudit()
    }

    await reconnectRecordsObserver()
  })

  watch(
    () => props.canViewAudit,
    (canViewAudit) => {
      if (!canViewAudit && archiveView.value === 'audit') {
        archiveView.value = 'records'
      }
    },
  )

  watch(recordsDaySections, reconnectRecordsObserver)
  watch(hasMoreRecordDays, reconnectRecordsObserver)

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
    selectedEmployee,
    periodStart,
    periodEnd,
    recordsLoadMoreRef,
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
    visibleRecordsDaySections,
    hasMoreRecordDays,
    auditLogs,
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
