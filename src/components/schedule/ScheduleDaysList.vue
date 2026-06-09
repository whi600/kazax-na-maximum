<script setup>
import { Calendar } from 'lucide-vue-next'
import { formatDateHeader, formatWeekDay } from '../../scheduleUtils'
import ScheduleShiftCard from './ScheduleShiftCard.vue'

defineProps({
  days: { type: Array, default: () => [] },
  approvedCount: { type: Number, default: 0 },
  canManageSchedule: { type: Boolean, default: false },
  canSelfCancel: { type: Function, required: true },
  isNewShift: { type: Function, required: true },
})

const emit = defineEmits(['book', 'cancel', 'edit', 'delete'])
</script>

<template>
  <TransitionGroup name="day-card" appear tag="div" class="space-y-8">
    <div v-for="(day, dayIndex) in days" :key="day.date" class="day-card">
      <div class="flex items-center justify-between mb-3 ml-1">
        <div>
          <h3
            class="text-[11px] font-black uppercase tracking-widest"
            :class="day.isPast ? 'text-slate-300' : 'text-blue-600'"
          >
            {{ formatDateHeader(day.date) }}
          </h3>
        </div>
      </div>

      <div
        v-if="day.shifts.length === 0"
        class="border border-dashed rounded-lg p-4 text-center"
        :class="day.isPast ? 'bg-slate-100/70 border-slate-200' : 'bg-white/70 border-slate-100'"
      >
        <p
          class="text-[10px] font-black uppercase"
          :class="day.isPast ? 'text-slate-300' : 'text-slate-300'"
        >
          {{ formatWeekDay(day.date) }} свободен
        </p>
      </div>

      <TransitionGroup name="shift-card" appear tag="div" class="space-y-2">
        <ScheduleShiftCard
          v-for="(shift, shiftIndex) in day.shifts"
          :key="shift.id"
          :shift="shift"
          :is-past="day.isPast"
          :is-new="isNewShift(shift)"
          :can-manage-schedule="canManageSchedule"
          :can-self-cancel="canSelfCancel(shift)"
          :day-delay="`${dayIndex * 80}ms`"
          :shift-delay="`${shiftIndex * 70}ms`"
          @book="emit('book', shift)"
          @cancel="emit('cancel', shift)"
          @edit="emit('edit', shift)"
          @delete="emit('delete', shift)"
        />
      </TransitionGroup>
    </div>
  </TransitionGroup>

  <div v-if="approvedCount === 0" class="text-center py-20 opacity-20 schedule-fade">
    <Calendar class="w-12 h-12 mx-auto mb-2" />
    <p class="text-xs font-black uppercase">График не заполнен</p>
  </div>
</template>
