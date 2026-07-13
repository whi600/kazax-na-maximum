<script setup>
import { Calendar, UserRound } from 'lucide-vue-next'
import ArchiveLoadMoreTrigger from './ArchiveLoadMoreTrigger.vue'

defineProps({
  loading: { type: Boolean, default: false },
  selectedEmployee: { type: String, default: 'all' },
  employees: { type: Array, default: () => [] },
  totalShifts: { type: Number, default: 0 },
  groups: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
  formatShiftDay: { type: Function, required: true },
  formatShiftWeekday: { type: Function, required: true },
})

const emit = defineEmits(['update:selected-employee', 'load-more'])
</script>

<template>
  <div class="space-y-3">
    <section class="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div class="flex items-end gap-3">
        <label class="min-w-0 flex-1">
          <span class="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <UserRound class="h-3.5 w-3.5 text-blue-600" />
            Сотрудник
          </span>
          <select
            :value="selectedEmployee"
            class="block h-10 w-full truncate rounded-lg border border-slate-100 bg-slate-50 px-3 text-sm font-black text-slate-800 outline-none transition-colors focus:border-blue-300"
            aria-label="Выбрать сотрудника"
            @change="emit('update:selected-employee', $event.target.value)"
          >
            <option value="all">Все сотрудники</option>
            <option v-for="employee in employees" :key="employee.key" :value="employee.key">
              {{ employee.name }} · {{ employee.count }} смен
            </option>
          </select>
        </label>

        <div class="shrink-0 pb-1 text-right">
          <p class="text-xl font-black leading-none text-blue-600">{{ totalShifts }}</p>
          <p class="mt-1 text-[9px] font-black uppercase text-slate-400">смен</p>
        </div>
      </div>
    </section>

    <div
      v-if="loading"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400 animate-pulse"
    >
      Загрузка смен...
    </div>

    <div
      v-else-if="groups.length === 0"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400"
    >
      {{ hasMore ? 'Ищем смены сотрудника...' : 'Смен нет' }}
    </div>

    <ArchiveLoadMoreTrigger
      v-if="!loading && groups.length === 0"
      :enabled="hasMore"
      :loading="loading"
      label="Продолжить поиск"
      @load="emit('load-more')"
    />

    <template v-if="!loading && groups.length > 0">
      <section v-for="group in groups" :key="group.label" class="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          <Calendar class="h-3.5 w-3.5 text-blue-600" />
          <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">{{ group.label }}</span>
        </div>

        <div class="divide-y divide-slate-100">
          <article
            v-for="shift in group.items"
            :key="shift.id"
            class="flex items-center justify-between gap-3 px-3 py-3"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-black leading-tight text-slate-800">
                {{ formatShiftDay(shift.date) }}
              </p>
              <p class="mt-0.5 truncate text-[10px] font-bold uppercase text-slate-400">
                {{ formatShiftWeekday(shift.date) }}
                <span v-if="selectedEmployee === 'all'"> • {{ shift.employee_name }}</span>
              </p>
            </div>
            <time class="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white">
              {{ shift.start_time }}–{{ shift.end_time }}
            </time>
          </article>
        </div>
      </section>

      <ArchiveLoadMoreTrigger
        :enabled="hasMore"
        :loading="loading"
        label="Показать еще смены"
        @load="emit('load-more')"
      />
    </template>
  </div>
</template>
