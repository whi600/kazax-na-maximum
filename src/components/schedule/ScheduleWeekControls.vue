<script setup>
import { Plus } from 'lucide-vue-next'
import { formatWeekRange } from '../../scheduleUtils'

const props = defineProps({
  weekStarts: { type: Array, default: () => [] },
  selectedWeekStart: { type: String, default: '' },
  selectedWeekStats: { type: Object, required: true },
  canManageSchedule: { type: Boolean, default: false },
  addDisabled: { type: Boolean, default: false },
  showMineOnly: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select-week',
  'hold-week',
  'cancel-hold',
  'add-week',
  'toggle-mine',
])

const handleWeekPointerDown = (event, weekStart) => {
  event.preventDefault()
  emit('hold-week', weekStart)
}

const handleWeekClick = (event, weekStart) => {
  event.preventDefault()
  emit('select-week', weekStart)
}

const formatHours = (hours) =>
  String(Math.round(Number(hours || 0) * 10) / 10).replace('.', ',')
</script>

<template>
  <section class="mb-4 space-y-2.5 schedule-fade">
    <div class="flex items-center gap-2">
      <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        <button
          v-for="weekStart in weekStarts"
          :key="weekStart"
          type="button"
          class="shrink-0 select-none rounded-lg border px-3 py-2 text-left transition-colors"
          style="-webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation;"
          :class="
            weekStart === selectedWeekStart
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-100 bg-white text-slate-500'
          "
          @click="handleWeekClick($event, weekStart)"
          @pointerdown="handleWeekPointerDown($event, weekStart)"
          @pointerup="emit('cancel-hold')"
          @pointerleave="emit('cancel-hold')"
          @pointercancel="emit('cancel-hold')"
          @contextmenu.prevent
        >
          <span class="block text-xs font-black">{{ formatWeekRange(weekStart) }}</span>
        </button>

        <button
          v-if="canManageSchedule"
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-500 transition-colors active:bg-slate-50 disabled:opacity-40"
          :disabled="addDisabled"
          aria-label="Добавить неделю"
          @click="emit('add-week')"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>

    </div>

    <div class="flex min-h-10 items-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-1.5 text-[10px] font-black uppercase text-slate-500 shadow-sm">
      <div class="min-w-0 flex-1 truncate px-1">
        <template v-if="showMineOnly">
          <span class="text-blue-600">Мои:</span>
          <span class="ml-1">{{ selectedWeekStats.myCount }} смен · {{ formatHours(selectedWeekStats.myHours) }} ч</span>
        </template>
        <template v-else>
          <span>Всего: {{ selectedWeekStats.shiftsCount }}</span>
          <span class="mx-1.5 text-slate-200">•</span>
          <span class="text-blue-600">Свободно: {{ selectedWeekStats.openCount }}</span>
        </template>
      </div>

      <div class="flex shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        <button
          type="button"
          class="h-8 px-2.5 text-[10px] font-black uppercase transition-colors"
          :class="showMineOnly ? 'text-slate-400' : 'bg-slate-900 text-white'"
          @click="showMineOnly && emit('toggle-mine')"
        >
          Все
        </button>
        <button
          type="button"
          class="h-8 px-2.5 text-[10px] font-black uppercase transition-colors"
          :class="showMineOnly ? 'bg-blue-600 text-white' : 'text-slate-400'"
          @click="!showMineOnly && emit('toggle-mine')"
        >
          Мои
        </button>
      </div>
    </div>
  </section>
</template>
