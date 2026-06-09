<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: String, default: '' },
  title: { type: String, default: 'Выберите дату' },
  minDate: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'close'])

const parseDate = (dateStr) => {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

const toDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const visibleMonth = ref(parseDate(props.modelValue))
const todayKey = toDateKey(new Date())
const minDateKey = computed(() => props.minDate || '')

watch(
  () => props.modelValue,
  (value) => {
    visibleMonth.value = parseDate(value)
  },
)

const monthTitle = computed(() =>
  visibleMonth.value.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  }),
)

const calendarDays = computed(() => {
  const year = visibleMonth.value.getFullYear()
  const month = visibleMonth.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const firstWeekDay = firstDay.getDay() || 7
  const start = new Date(year, month, 2 - firstWeekDay)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)

    const key = toDateKey(date)
    return {
      key,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isSelected: key === props.modelValue,
      isToday: key === todayKey,
      isDisabled: Boolean(minDateKey.value && key < minDateKey.value),
    }
  })
})

const canGoPrevMonth = computed(() => {
  if (!minDateKey.value) return true

  const minDate = parseDate(minDateKey.value)
  const prevMonthStart = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() - 1,
    1,
  )

  return (
    prevMonthStart.getFullYear() > minDate.getFullYear() ||
    (prevMonthStart.getFullYear() === minDate.getFullYear() &&
      prevMonthStart.getMonth() >= minDate.getMonth())
  )
})

const changeMonth = (amount) => {
  if (amount < 0 && !canGoPrevMonth.value) return
  visibleMonth.value = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + amount,
    1,
  )
}

const selectDate = (dateKey) => {
  if (minDateKey.value && dateKey < minDateKey.value) return
  emit('update:modelValue', dateKey)
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-[140] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm pt-safe"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full max-w-md rounded-t-[28px] p-4 sheet-safe sheet-max overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
      <div class="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 class="text-xl font-black uppercase italic tracking-tighter">{{ title }}</h3>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{{ monthTitle }}</p>
        </div>
        <button @click="emit('close')" class="bg-slate-50 p-2 rounded-full text-slate-300">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex items-center justify-between mb-4">
        <button
          @click="changeMonth(-1)"
          :disabled="!canGoPrevMonth"
          class="w-11 h-11 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
          :class="!canGoPrevMonth ? 'opacity-30 pointer-events-none' : ''"
        >
          <ChevronLeft class="w-5 h-5" />
        </button>
        <div class="text-sm font-black text-slate-800 capitalize">{{ monthTitle }}</div>
        <button
          @click="changeMonth(1)"
          class="w-11 h-11 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
        >
          <ChevronRight class="w-5 h-5" />
        </button>
      </div>

      <div class="grid grid-cols-7 gap-1 mb-2">
        <div
          v-for="day in ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']"
          :key="day"
          class="h-8 flex items-center justify-center text-[10px] font-black text-slate-400"
        >
          {{ day }}
        </div>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="date in calendarDays"
          :key="date.key"
          @click="selectDate(date.key)"
          :disabled="date.isDisabled"
          class="h-11 rounded-lg text-sm font-black border transition-all active:scale-95"
          :class="[
            date.isSelected
              ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
              : 'bg-slate-50 text-slate-800 border-slate-100',
            !date.isCurrentMonth && !date.isSelected ? 'opacity-35' : '',
            date.isToday && !date.isSelected ? 'text-blue-600 border-blue-200' : '',
            date.isDisabled ? 'opacity-30 pointer-events-none text-slate-300' : '',
          ]"
        >
          {{ date.day }}
        </button>
      </div>
    </div>
  </div>
</template>
