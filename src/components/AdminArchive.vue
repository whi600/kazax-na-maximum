<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { recordsApi, shiftsApi } from '../api'
import { Calendar, Clock, User, Check } from 'lucide-vue-next'

const props = defineProps({
  lockedMode: { type: String, default: '' },
  hideToggle: { type: Boolean, default: false },
})

const archiveMode = ref(props.lockedMode || 'records')
const recordsHistory = ref({})
const shifts = ref([])

const recordsLoading = ref(false)
const shiftsLoading = ref(false)
const recordsLoaded = ref(false)
const shiftsLoaded = ref(false)

const showPaid = ref(false)
const selectedEmployee = ref('all')

const safeAlert = (message) => alert(message)

const formatDateLabel = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
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
  const uniqueNames = new Set()

  baseShifts.value.forEach((shift) => {
    if (shift.employee_name) {
      uniqueNames.add(shift.employee_name)
    }
  })

  return Array.from(uniqueNames)
    .map((name) => ({ key: name, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const visibleShifts = computed(() =>
  baseShifts.value.filter((shift) => (showPaid.value ? true : !shift.is_paid)),
)

const filteredShifts = computed(() =>
  visibleShifts.value.filter((shift) => {
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
    const label = formatDateLabel(shift.date)

    if (!map.has(label)) {
      const group = { label, items: [] }
      map.set(label, group)
      list.push(group)
    }

    map.get(label).items.push(shift)
  })

  return list
})

const totalHoursAll = computed(() =>
  visibleShifts.value.reduce((sum, shift) => sum + parseShiftHours(shift), 0),
)

const totalHoursSelected = computed(() => {
  if (selectedEmployee.value === 'all') return null

  return filteredShifts.value.reduce(
    (sum, shift) => sum + parseShiftHours(shift),
    0,
  )
})

const loadRecords = async () => {
  recordsLoading.value = true

  try {
    const response = await recordsApi.archive()
    const rows = response.records || []

    const groups = {}
    rows.forEach((record) => {
      const dateLabel = formatDateLabel(record.created_at)
      if (!groups[dateLabel]) groups[dateLabel] = []

      if (!groups[dateLabel].find((item) => item.product_id === record.product_id)) {
        groups[dateLabel].push(record)
      }
    })

    recordsHistory.value = groups
  } catch (error) {
    safeAlert(error?.message || 'Ошибка загрузки архива')
  } finally {
    recordsLoading.value = false
    recordsLoaded.value = true
  }
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

const togglePaid = async (shift) => {
  const nextValue = !shift.is_paid
  const previousValue = shift.is_paid

  shift.is_paid = nextValue

  try {
    await shiftsApi.setPaid(shift.id, nextValue)
  } catch (error) {
    shift.is_paid = previousValue
    safeAlert(error?.message || 'Не удалось обновить статус оплаты')
  }
}

watch(archiveMode, async (mode) => {
  if (mode === 'records' && !recordsLoaded.value) {
    await loadRecords()
  }

  if (mode === 'shifts' && !shiftsLoaded.value) {
    await loadShifts()
  }
})

onMounted(async () => {
  await loadRecords()
  if (props.lockedMode) {
    archiveMode.value = props.lockedMode
  }
})
</script>

<template>
  <div class="space-y-4 pb-10">
    <div v-if="!hideToggle" class="flex items-center gap-2 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm">
      <button
        @click="archiveMode = 'records'"
        :class="archiveMode === 'records' ? 'bg-blue-600 text-white' : 'text-slate-500'"
        class="flex-1 text-[10px] font-black uppercase py-1.5 rounded-xl transition-colors"
      >
        Остатки
      </button>
      <button
        @click="archiveMode = 'shifts'"
        :class="archiveMode === 'shifts' ? 'bg-blue-600 text-white' : 'text-slate-500'"
        class="flex-1 text-[10px] font-black uppercase py-1.5 rounded-xl transition-colors"
      >
        Смены
      </button>
    </div>

    <div v-if="archiveMode === 'records'">
      <div v-if="recordsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка истории...
      </div>

      <div v-else-if="Object.keys(recordsHistory).length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Архив пуст
      </div>

      <div v-for="(records, date) in recordsHistory" :key="date" class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
        <div class="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center gap-2">
          <Calendar class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{{ date }}</span>
        </div>

        <div class="p-2 space-y-1.5">
          <div v-for="record in records" :key="record.id" class="flex justify-between items-center text-[11px] font-bold">
            <span class="text-slate-700 truncate mr-2">{{ record.products?.name || 'Удален' }}</span>
            <div class="flex gap-1.5 flex-shrink-0">
              <span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">П:{{ record.arrival }}</span>
              <span class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded">О:{{ record.remainder }}</span>
              <span class="px-1.5 py-0.5 bg-red-50 text-red-500 rounded">С:{{ record.write_off }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="bg-white rounded-2xl p-2.5 border border-slate-100 shadow-sm space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-blue-500" />
            <span class="text-[10px] font-black uppercase text-slate-600">Часы работы</span>
          </div>
          <div class="text-[12px] font-black text-slate-800">{{ formatHours(totalHoursAll) }} ч</div>
        </div>

        <div class="flex gap-2">
          <div class="flex-1 bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-100">
            <label class="text-[9px] font-black uppercase text-slate-400">Сотрудник</label>
            <div class="flex items-center gap-2 mt-1">
              <User class="w-3.5 h-3.5 text-slate-400" />
              <select v-model="selectedEmployee" class="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">Все</option>
                <option v-for="employee in employees" :key="employee.key" :value="employee.key">
                  {{ employee.name }}
                </option>
              </select>
            </div>
          </div>

          <button
            @click="showPaid = !showPaid"
            class="bg-slate-800 text-white text-[9px] font-black uppercase px-3 rounded-xl shadow-md"
          >
            {{ showPaid ? 'Скрыть оплач.' : 'Показать все' }}
          </button>
        </div>

        <div v-if="totalHoursSelected !== null" class="text-[10px] font-black text-slate-500 uppercase">
          Итого по сотруднику: {{ formatHours(totalHoursSelected) }} ч
        </div>
      </div>

      <div v-if="shiftsLoading" class="text-center py-10 font-bold text-slate-400 text-xs uppercase animate-pulse">
        Загрузка смен...
      </div>

      <div v-else-if="groupedShiftHistory.length === 0" class="text-center py-10 text-slate-400 text-xs font-bold uppercase">
        Смен нет
      </div>

      <div v-for="group in groupedShiftHistory" :key="group.label" class="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
        <div class="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center gap-2">
          <Calendar class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{{ group.label }}</span>
        </div>
        <div class="p-2 space-y-1.5">
          <div v-for="shift in group.items" :key="shift.id" class="flex items-center justify-between text-[11px] font-bold">
            <div class="min-w-0">
              <div class="text-slate-700 truncate">{{ shift.employee_name }}</div>
              <div class="text-[10px] text-slate-400 font-black">
                {{ shift.start_time }}–{{ shift.end_time }} • {{ formatHours(parseShiftHours(shift)) }} ч
              </div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <span v-if="shift.is_paid" class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[9px] font-black uppercase">Оплачено</span>
              <button
                @click="togglePaid(shift)"
                class="px-2 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1"
                :class="shift.is_paid ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'"
              >
                <Check class="w-3 h-3" />
                {{ shift.is_paid ? 'Вернуть' : 'В счет' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
