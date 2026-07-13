<script setup>
import { CalendarRange } from 'lucide-vue-next'
import NativeDateButton from '../shared/NativeDateButton.vue'

defineProps({
  loading: { type: Boolean, default: false },
  periodStart: { type: String, default: '' },
  periodEnd: { type: String, default: '' },
  periodLabel: { type: String, default: '' },
  totalHours: { type: Number, default: 0 },
  shiftsCount: { type: Number, default: 0 },
  employeeStats: { type: Array, default: () => [] },
  formatDateLabel: { type: Function, required: true },
  formatHours: { type: Function, required: true },
})

const emit = defineEmits(['update:period-start', 'update:period-end'])
</script>

<template>
  <div class="space-y-3">
    <section class="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <p class="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <CalendarRange class="h-3.5 w-3.5 text-blue-600" />
            Выбранный период
          </p>
          <p class="mt-1 text-[10px] font-bold text-slate-400">{{ periodLabel }}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-2xl font-black leading-none text-blue-600">{{ formatHours(totalHours) }} ч</p>
          <p class="mt-1 text-[9px] font-black uppercase text-slate-400">{{ shiftsCount }} смен</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <NativeDateButton
          :model-value="periodStart"
          label="Начало"
          :display-value="formatDateLabel(periodStart)"
          @update:model-value="emit('update:period-start', $event)"
        />
        <NativeDateButton
          :model-value="periodEnd"
          label="Конец"
          :display-value="formatDateLabel(periodEnd)"
          @update:model-value="emit('update:period-end', $event)"
        />
      </div>
    </section>

    <div
      v-if="loading"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400 animate-pulse"
    >
      Загрузка смен...
    </div>

    <div
      v-else-if="employeeStats.length === 0"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400"
    >
      В этом периоде смен нет
    </div>

    <section v-else class="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <article
        v-for="employee in employeeStats"
        :key="employee.name"
        class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-black text-slate-800">{{ employee.name }}</p>
          <p class="mt-0.5 text-[10px] font-bold uppercase text-slate-400">{{ employee.shiftsCount }} смен</p>
        </div>
        <p class="shrink-0 text-lg font-black text-blue-600">{{ formatHours(employee.hours) }} ч</p>
      </article>
    </section>
  </div>
</template>
