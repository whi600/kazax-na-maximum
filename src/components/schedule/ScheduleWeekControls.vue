<script setup>
import { Plus } from 'lucide-vue-next'
import { formatWeekRange } from '../../scheduleUtils'

defineProps({
  weekStarts: { type: Array, default: () => [] },
  selectedWeekStart: { type: String, default: '' },
  selectedWeekStats: { type: Object, required: true },
  canManageSchedule: { type: Boolean, default: false },
  addDisabled: { type: Boolean, default: false },
  showMineOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['select-week', 'hold-week', 'cancel-hold', 'add-week', 'toggle-mine'])

const handleWeekPointerDown = (event, weekStart) => {
  event.preventDefault()
  emit('hold-week', weekStart)
}

const handleWeekClick = (event, weekStart) => {
  event.preventDefault()
  emit('select-week', weekStart)
}
</script>

<template>
  <div class="mb-4 schedule-fade">
    <div class="flex gap-2 overflow-x-auto pb-1 mb-3">
      <button
        v-for="weekStart in weekStarts"
        :key="weekStart"
        @click="handleWeekClick($event, weekStart)"
        @pointerdown="handleWeekPointerDown($event, weekStart)"
        @pointerup="emit('cancel-hold')"
        @pointerleave="emit('cancel-hold')"
        @pointercancel="emit('cancel-hold')"
        @contextmenu.prevent
        class="shrink-0 select-none rounded-lg px-3 py-2 border text-left transition-all"
        style="-webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation;"
        :class="
          weekStart === selectedWeekStart
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-400 border-slate-100'
        "
        type="button"
      >
        <span class="block text-[10px] font-black uppercase">Неделя</span>
        <span class="block text-xs font-black">{{ formatWeekRange(weekStart) }}</span>
      </button>
      <button
        v-if="canManageSchedule"
        @click="emit('add-week')"
        :disabled="addDisabled"
        class="shrink-0 rounded-lg px-3 py-2 border text-left transition-all bg-white text-slate-400 border-slate-100 flex items-center justify-center min-w-[108px]"
        :class="addDisabled ? 'opacity-40 pointer-events-none' : ''"
        type="button"
        aria-label="Добавить неделю"
      >
        <Plus class="w-5 h-5" />
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2 mb-5">
      <div class="schedule-stat bg-white rounded-lg border border-slate-100 p-3">
        <p class="text-[9px] font-black text-slate-400 uppercase">Всего</p>
        <p class="text-xl font-black text-slate-800">{{ selectedWeekStats.shiftsCount }}</p>
      </div>
      <div class="schedule-stat bg-white rounded-lg border border-slate-100 p-3">
        <p class="text-[9px] font-black text-slate-400 uppercase">Свободно</p>
        <p class="text-xl font-black text-blue-600">{{ selectedWeekStats.openCount }}</p>
      </div>
      <div class="schedule-stat bg-white rounded-lg border border-slate-100 p-3">
        <p class="text-[9px] font-black text-slate-400 uppercase">Мои</p>
        <p class="text-xl font-black text-blue-600">{{ selectedWeekStats.myCount }}</p>
      </div>
    </div>

    <button
      type="button"
      @click="emit('toggle-mine')"
      class="mb-4 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all active:scale-[0.99]"
      :class="
        showMineOnly
          ? 'border-blue-200 bg-blue-50 text-blue-600'
          : 'border-slate-100 bg-white text-slate-400'
      "
    >
      <span class="text-[10px] font-black uppercase">Показывать только мои смены</span>
      <span
        class="h-5 w-9 rounded-full p-0.5 transition-colors"
        :class="showMineOnly ? 'bg-blue-600' : 'bg-slate-200'"
      >
        <span
          class="block h-4 w-4 rounded-full bg-white transition-transform"
          :class="showMineOnly ? 'translate-x-4' : 'translate-x-0'"
        />
      </span>
    </button>
  </div>
</template>
