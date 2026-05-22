<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { recordsApi, shiftsApi } from '../api'
import { Calendar, Clock, User } from 'lucide-vue-next'
import DatePickerSheet from './DatePickerSheet.vue'

const props = defineProps({
  lockedMode: { type: String, default: '' },
  hideToggle: { type: Boolean, default: false },
  canViewAudit: { type: Boolean, default: false },
})

const normalizeArchiveView = (view) => {
  if (view === 'shifts') return 'shiftHistory'
  if (view === 'hours') return 'shiftHours'
  if (view === 'audit') return 'audit'
  if (view === 'shiftHistory' || view === 'shiftHours') return view
  return 'records'
}

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
const activeDatePicker = ref('')
const visibleRecordDays = ref(5)
const recordsLoadMoreRef = ref(null)
let recordsLoadObserver = null

const safeAlert = (message) => alert(message)

const recordCategorySections = [
  { key: 'bakery', label: 'Выпечка' },
  { key: 'pastry', label: 'Кондитерка' },
  { key: 'other', label: 'Другое' },
]

const parseDate = (dateStr) => {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

const formatDateLabel = (dateStr) => {
  if (!dateStr) return ''
  return parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const formatShiftDay = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

const formatShiftWeekday = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('ru-RU', { weekday: 'long' })

const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getRecordDateKey = (dateValue) => {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return toDateKey(date)
}

const formatRecordWeekday = (dateKey) =>
  parseDate(dateKey).toLocaleDateString('ru-RU', { weekday: 'long' }).toUpperCase()

const setDefaultPeriod = () => {
  const now = new Date()
  periodStart.value = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  periodEnd.value = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
}

const parseShiftHours = (shift) => {
  if (!shift?.date || !shift?.start_time || !shift?.end_time) return 0

  const start = new Date(`${shift.date}T${shift.start_time}`)
  const end = new Date(`${shift.date}T${shift.end_time}`)

  if (end <= start) {
    end.setDate(end.getDate() + 1)
  }

  const diff = (end - start) / 3600000
  return diff > 0 ? diff : 0
}

const formatHours = (hours) => {
  const rounded = Math.round(hours * 10) / 10
  return String(rounded).replace('.', ',')
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
    const date = parseDate(shift.date)
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

const auditActionLabels = {
  'product.create': 'Товар добавлен',
  'product.update': 'Товар изменен',
  'product.delete': 'Товар удален',
  'shift.help_request': 'Заявка на помощь',
  'shift.admin_create': 'Смена создана',
  'shift.bulk_save': 'Изменения расписания',
  'shift.book': 'Сотрудник записан',
  'shift.unbook': 'Запись снята',
  'shift.approve': 'Заявка подтверждена',
  'shift.delete': 'Смена удалена',
  'user.role_update': 'Роль пользователя изменена',
}

const auditEntityLabels = {
  product: 'Ассортимент',
  shift: 'График',
  user: 'Пользователи',
}

const formatAuditAction = (action) => auditActionLabels[action] || action
const formatAuditEntity = (entityType) => auditEntityLabels[entityType] || entityType

const formatAuditSummary = (log) => {
  if (log.action === 'shift.bulk_save') {
    const deleted = Number(log.context?.deletedCount || 0)
    const created = Number(log.context?.createdCount || 0)
    return `Добавлено: ${created}, удалено: ${deleted}`
  }

  const source = log.after || log.before
  if (source?.name) return source.name
  if (source?.date && source?.start_time && source?.end_time) {
    return `${source.date} • ${source.start_time}-${source.end_time}`
  }

  return ''
}

const recordsDaySections = computed(() =>
  Object.entries(recordsHistory.value)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, rows]) => {
      const sections = recordCategorySections
        .map((category) => ({
          ...category,
          rows: rows.filter((record) => (record.products?.category || 'other') === category.key),
        }))
        .filter((section) => section.rows.length > 0)

      return {
        key: dateKey,
        dateLabel: formatDateLabel(dateKey),
        weekDayLabel: formatRecordWeekday(dateKey),
        sections,
      }
    }),
)

const visibleRecordsDaySections = computed(() =>
  recordsDaySections.value.slice(0, visibleRecordDays.value),
)

const hasMoreRecordDays = computed(
  () => visibleRecordsDaySections.value.length < recordsDaySections.value.length,
)

const updateActiveDate = (date) => {
  if (activeDatePicker.value === 'start') {
    periodStart.value = date
    return
  }

  if (activeDatePicker.value === 'end') {
    periodEnd.value = date
  }
}

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
    shifts.value = response.shifts || []
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

watch(recordsDaySections, async () => {
  await reconnectRecordsObserver()
})

watch(hasMoreRecordDays, async () => {
  await reconnectRecordsObserver()
})

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
</script>

<template>
  <div class="space-y-4 pb-10">
    <div
      v-if="!hideToggle"
      class="relative grid gap-1.5 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm overflow-hidden"
      :style="{ gridTemplateColumns: `repeat(${archiveTabs.length}, minmax(0, 1fr))` }"
    >
      <div
        class="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-blue-600 shadow-lg shadow-blue-100 transition-transform duration-300 ease-out pointer-events-none"
        :style="{
          width: `calc((100% - ${(archiveTabs.length - 1) * 0.375 + 0.75}rem) / ${archiveTabs.length})`,
          transform: `translateX(calc(${archiveViewIndex} * (100% + 0.375rem)))`,
        }"
        aria-hidden="true"
      />
      <button
        v-for="tab in archiveTabs"
        :key="tab.key"
        @click="archiveView = tab.key"
        :class="archiveView === tab.key ? 'text-white' : 'text-slate-400'"
        class="relative z-10 text-[10px] font-black uppercase py-2 rounded-xl transition-colors duration-300"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="archiveView === 'records'">
      <div v-if="recordsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка истории...
      </div>

      <div
        v-else-if="recordsDaySections.length === 0"
        class="text-center py-10 text-slate-400 text-xs font-bold uppercase"
      >
        Архив пуст
      </div>

      <div
        v-for="section in visibleRecordsDaySections"
        :key="section.key"
        class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm"
      >
        <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
          <Calendar class="w-5 h-5 text-blue-600" />
          <span class="text-xs font-black text-slate-500 uppercase tracking-normal">
            {{ section.dateLabel }} • {{ section.weekDayLabel }}
          </span>
        </div>
        <div class="space-y-4 p-3">
          <div
            v-for="category in section.sections"
            :key="category.key"
            class="overflow-hidden rounded-xl border border-slate-100"
          >
            <div class="bg-slate-50 px-3 py-2 text-xs font-black uppercase text-slate-500">
              {{ category.label }}
            </div>
            <table class="w-full table-fixed text-sm">
              <thead>
                <tr class="text-slate-500 uppercase text-[11px] font-black">
                  <th class="text-left px-2.5 py-2.5 w-[43%] border-b border-r border-slate-100">Продукт</th>
                  <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-r border-slate-100">Приход</th>
                  <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-r border-slate-100">Остаток</th>
                  <th class="text-right px-1.5 py-2.5 w-[19%] border-b border-slate-100">Списание</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="record in category.rows"
                  :key="record.id"
                  class="border-t border-slate-100 font-bold"
                >
                  <td class="px-2.5 py-3 leading-tight text-slate-900 border-r border-slate-100">{{ record.products?.name || 'Удален' }}</td>
                  <td class="px-1.5 py-3 text-right text-blue-600 border-r border-slate-100">{{ record.arrival }}</td>
                  <td class="px-1.5 py-3 text-right text-slate-800 border-r border-slate-100">{{ record.remainder }}</td>
                  <td class="px-1.5 py-3 text-right text-red-500">{{ record.write_off }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div
        v-if="hasMoreRecordDays"
        ref="recordsLoadMoreRef"
        class="py-2 text-center text-[10px] font-black uppercase text-slate-300"
      >
        Загружаем еще...
      </div>
    </div>

    <div v-else>
      <div v-if="archiveView === 'shiftHistory'" class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <User class="w-4 h-4 text-blue-600" />
            <span class="text-[10px] font-black uppercase text-slate-400">Сотрудник</span>
          </div>
          <p class="text-sm font-black text-slate-800">{{ selectedEmployeeSummary }}</p>
        </div>

        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            @click="selectedEmployee = 'all'"
            class="shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-20"
            :class="
              selectedEmployee === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-500 border-slate-100'
            "
          >
            <span class="block text-[10px] font-black uppercase">Все</span>
            <span class="block text-xs font-black">{{ baseShifts.length }} смен</span>
          </button>

          <button
            v-for="employee in employees"
            :key="employee.key"
            @click="selectedEmployee = employee.key"
            class="shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-24"
            :class="
              selectedEmployee === employee.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-500 border-slate-100'
            "
          >
            <span class="block text-[10px] font-black uppercase max-w-28 truncate">{{ employee.name }}</span>
            <span class="block text-xs font-black">{{ employee.count }} смен</span>
          </button>
        </div>
      </div>

      <div v-if="archiveView === 'shiftHours'" class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <Clock class="w-4 h-4 text-blue-600" />
            <span class="text-[10px] font-black uppercase text-slate-400">Часы за период</span>
          </div>
          <p class="text-sm font-black text-slate-800">
            {{ formatHours(periodTotalHours) }} ч • {{ periodShifts.length }} смен
          </p>
          <p class="text-[10px] font-bold text-slate-400 mt-0.5">{{ periodLabel }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label
            class="bg-slate-50 rounded-xl px-2.5 py-2 border border-slate-100 cursor-pointer"
            @click.prevent="activeDatePicker = 'start'"
          >
            <span class="block text-[9px] font-black uppercase text-slate-400 mb-1">Начало</span>
            <span class="block text-[11px] font-bold text-slate-800">{{ formatDateLabel(periodStart) }}</span>
          </label>
          <label
            class="bg-slate-50 rounded-xl px-2.5 py-2 border border-slate-100 cursor-pointer"
            @click.prevent="activeDatePicker = 'end'"
          >
            <span class="block text-[9px] font-black uppercase text-slate-400 mb-1">Конец</span>
            <span class="block text-[11px] font-bold text-slate-800">{{ formatDateLabel(periodEnd) }}</span>
          </label>
        </div>
      </div>

      <div v-if="shiftsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка смен...
      </div>

      <div v-else-if="archiveView === 'shiftHistory' && groupedShiftHistory.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Смен нет
      </div>

      <div v-else-if="archiveView === 'shiftHours' && periodEmployeeStats.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        В этом периоде смен нет
      </div>
      <div v-else-if="archiveView === 'audit' && !auditLoading && auditLogs.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Изменений пока нет
      </div>

      <template v-if="archiveView === 'shiftHistory'">
        <div v-for="group in groupedShiftHistory" :key="group.label" class="space-y-2">
          <div class="px-1 flex items-center gap-2">
            <Calendar class="w-3.5 h-3.5 text-blue-600" />
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">{{ group.label }}</span>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="shift in group.items"
              :key="shift.id"
              class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[13px] font-black text-slate-800 truncate">
                    {{ formatShiftDay(shift.date) }}
                  </div>
                  <div class="text-[10px] text-slate-400 font-black uppercase">
                    {{ formatShiftWeekday(shift.date) }}
                    <span v-if="selectedEmployee === 'all'"> • {{ shift.employee_name }}</span>
                  </div>
                </div>

                <div class="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-right shrink-0">
                  <div class="text-[12px] font-black text-slate-800">
                    {{ shift.start_time }}–{{ shift.end_time }}
                  </div>
                  <div class="text-[9px] font-black text-blue-600 uppercase flex items-center justify-end gap-1">
                    <Clock class="w-3 h-3" />
                    смена
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="archiveView === 'shiftHours' && periodEmployeeStats.length > 0" class="space-y-2">
        <div
          v-for="employee in periodEmployeeStats"
          :key="employee.name"
          class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[13px] font-black text-slate-800 truncate">
                {{ employee.name }}
              </div>
              <div class="text-[10px] text-slate-400 font-black uppercase">
                {{ employee.shiftsCount }} смен
              </div>
            </div>

            <div class="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-right shrink-0">
              <div class="text-base font-black text-blue-600">
                {{ formatHours(employee.hours) }} ч
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="archiveView === 'audit'" class="space-y-2">
        <div v-if="auditLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
          Загрузка изменений...
        </div>

        <div
          v-for="log in auditLogs"
          :key="log.id"
          class="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-black text-slate-800 uppercase">{{ formatAuditAction(log.action) }}</p>
            <p class="text-[9px] font-black text-slate-400">{{ formatDateTimeLabel(log.created_at) }}</p>
          </div>
          <p class="text-[10px] font-black text-blue-600 mt-1 uppercase">
            {{ log.actor_name }} • {{ formatAuditEntity(log.entity_type) }}<span v-if="log.entity_id"> #{{ log.entity_id }}</span>
          </p>
          <p v-if="formatAuditSummary(log)" class="text-[10px] font-bold text-slate-500 mt-1">
            {{ formatAuditSummary(log) }}
          </p>
        </div>
      </div>
    </div>

    <DatePickerSheet
      v-if="activeDatePicker"
      :modelValue="activeDatePicker === 'start' ? periodStart : periodEnd"
      :title="activeDatePicker === 'start' ? 'Начало периода' : 'Конец периода'"
      @update:modelValue="updateActiveDate"
      @close="activeDatePicker = ''"
    />
  </div>
</template>
