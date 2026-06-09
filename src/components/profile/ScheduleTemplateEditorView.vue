<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, Check, Plus, RotateCw, Trash2 } from 'lucide-vue-next'
import { shiftsApi } from '../../api'
import {
  DEFAULT_WEEK_TEMPLATE_SHIFTS,
  normalizeTemplateShift,
} from '../../scheduleUtils'

const emit = defineEmits(['back'])

const dayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const dayFullLabels = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

const selectedDay = ref(0)
const templateShifts = ref([])
const loading = ref(true)
const saving = ref(false)
const statusText = ref('')
let tempId = -1

const makeLocalShift = (shift) => ({
  ...normalizeTemplateShift(shift),
  id: shift.id ?? tempId--,
})

const sortedShifts = computed(() =>
  [...templateShifts.value].sort((a, b) => {
    if (a.day_index !== b.day_index) return a.day_index - b.day_index
    return `${a.start_time}-${a.end_time}-${a.id}`.localeCompare(
      `${b.start_time}-${b.end_time}-${b.id}`,
    )
  }),
)

const selectedDayShifts = computed(() =>
  sortedShifts.value.filter((shift) => shift.day_index === selectedDay.value),
)

const dayCounts = computed(() =>
  dayLabels.map((_, dayIndex) =>
    templateShifts.value.filter((shift) => shift.day_index === dayIndex).length,
  ),
)

const setStatus = (message) => {
  statusText.value = message
  if (!message) return

  window.setTimeout(() => {
    if (statusText.value === message) statusText.value = ''
  }, 3500)
}

const loadTemplate = async () => {
  loading.value = true
  try {
    const response = await shiftsApi.template()
    templateShifts.value = (response.shifts || []).map(makeLocalShift)
  } catch (error) {
    setStatus(error?.message || 'Не удалось загрузить шаблон')
  } finally {
    loading.value = false
  }
}

const addShift = () => {
  const previous = selectedDayShifts.value[selectedDayShifts.value.length - 1]
  templateShifts.value = [
    ...templateShifts.value,
    makeLocalShift({
      day_index: selectedDay.value,
      start_time: previous?.start_time || '09:00',
      end_time: previous?.end_time || '18:00',
    }),
  ]
}

const updateShift = (id, field, value) => {
  templateShifts.value = templateShifts.value.map((shift) =>
    shift.id === id ? { ...shift, [field]: value } : shift,
  )
}

const removeShift = (id) => {
  templateShifts.value = templateShifts.value.filter((shift) => shift.id !== id)
}

const resetToDefault = () => {
  if (!window.confirm('Вернуть стандартный шаблон недели?')) return
  templateShifts.value = DEFAULT_WEEK_TEMPLATE_SHIFTS.map(makeLocalShift)
  setStatus('Стандартный шаблон подготовлен')
}

const buildPayload = () =>
  sortedShifts.value.map((shift) => ({
    day_index: shift.day_index,
    start_time: shift.start_time,
    end_time: shift.end_time,
  }))

const validatePayload = (payload) => {
  const invalid = payload.find((shift) => !shift.start_time || !shift.end_time || shift.start_time >= shift.end_time)
  if (!invalid) return true

  selectedDay.value = invalid.day_index
  setStatus('Время окончания должно быть позже начала')
  return false
}

const saveTemplate = async () => {
  const payload = buildPayload()
  if (!validatePayload(payload)) return

  saving.value = true
  try {
    const response = await shiftsApi.updateTemplate(payload)
    templateShifts.value = (response.shifts || []).map(makeLocalShift)
    setStatus('Базовое расписание сохранено')
  } catch (error) {
    setStatus(error?.message || 'Не удалось сохранить шаблон')
  } finally {
    saving.value = false
  }
}

onMounted(loadTemplate)
</script>

<template>
  <section class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm space-y-4">
    <button
      type="button"
      @click="emit('back')"
      class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      Назад в профиль
    </button>

    <div>
      <h2 class="text-lg font-black uppercase italic tracking-tighter text-slate-900">
        Базовое расписание
      </h2>
      <p class="mt-1 text-[11px] font-bold text-slate-400">
        Этот набор смен будет одноразово подставляться при создании новой недели.
      </p>
    </div>

    <div class="grid grid-cols-7 gap-1.5">
      <button
        v-for="(label, index) in dayLabels"
        :key="label"
        type="button"
        @click="selectedDay = index"
        class="rounded-lg border px-1 py-2 text-[10px] font-black uppercase transition-all"
        :class="
          selectedDay === index
            ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100'
            : 'border-slate-100 bg-slate-50 text-slate-500'
        "
      >
        <span class="block">{{ label }}</span>
        <span class="mt-0.5 block text-[9px] opacity-70">{{ dayCounts[index] }}</span>
      </button>
    </div>

    <div v-if="statusText" class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase text-blue-600">
      {{ statusText }}
    </div>

    <div v-if="loading" class="flex justify-center py-10 text-blue-600">
      <RotateCw class="w-6 h-6 animate-spin" />
    </div>

    <div v-else class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            {{ dayFullLabels[selectedDay] }}
          </p>
          <p class="text-sm font-black text-slate-900">
            {{ selectedDayShifts.length }} смен
          </p>
        </div>
        <button
          type="button"
          @click="addShift"
          class="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Plus class="w-3.5 h-3.5" />
          Смена
        </button>
      </div>

      <div class="space-y-2">
        <div
          v-for="shift in selectedDayShifts"
          :key="shift.id"
          class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
        >
          <label class="block">
            <span class="mb-1 block text-[9px] font-black uppercase text-slate-400">Начало</span>
            <input
              type="time"
              :value="shift.start_time"
              class="w-full rounded-lg border border-slate-100 bg-white px-2 py-2 text-sm font-black text-slate-900 outline-none focus:border-blue-300"
              @input="updateShift(shift.id, 'start_time', $event.target.value)"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-[9px] font-black uppercase text-slate-400">Конец</span>
            <input
              type="time"
              :value="shift.end_time"
              class="w-full rounded-lg border border-slate-100 bg-white px-2 py-2 text-sm font-black text-slate-900 outline-none focus:border-blue-300"
              @input="updateShift(shift.id, 'end_time', $event.target.value)"
            />
          </label>
          <button
            type="button"
            @click="removeShift(shift.id)"
            class="mb-0.5 rounded-lg bg-red-50 p-2.5 text-red-500 active:scale-95 transition-all"
            aria-label="Удалить смену"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <div
          v-if="selectedDayShifts.length === 0"
          class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[11px] font-black uppercase text-slate-400"
        >
          В этот день смен нет
        </div>
      </div>
    </div>

    <div class="grid grid-cols-[1fr_1.2fr] gap-2">
      <button
        type="button"
        @click="resetToDefault"
        class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500 active:scale-95 transition-all"
      >
        Сбросить
      </button>
      <button
        type="button"
        @click="saveTemplate"
        :disabled="saving || loading"
        class="rounded-lg bg-blue-600 px-3 py-3 text-[10px] font-black uppercase text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60"
      >
        <Check class="w-3.5 h-3.5" />
        {{ saving ? 'Сохранение...' : 'Сохранить' }}
      </button>
    </div>
  </section>
</template>
