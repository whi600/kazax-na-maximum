<script setup>
import { BarChart3, CalendarDays, CalendarRange, UsersRound } from 'lucide-vue-next'
import ArchiveReportsView from './ArchiveReportsView.vue'

defineProps({
  loading: { type: Boolean, default: false },
  sections: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
})

defineEmits(['open', 'load-more'])

const actions = [
  { key: 'calendar', label: 'По дням', hint: 'Календарь', icon: CalendarDays },
  { key: 'employees', label: 'Сотрудники', hint: 'Смены и часы', icon: UsersRound },
  { key: 'period', label: 'Период', hint: 'Общие итоги', icon: CalendarRange },
  { key: 'writeOffs', label: 'Списания', hint: 'График', icon: BarChart3 },
]
</script>

<template>
  <div class="space-y-4">
    <section>
      <p class="mb-2 px-1 text-[10px] font-black uppercase text-slate-400">Найти данные</p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="action in actions"
          :key="action.key"
          type="button"
          class="flex min-h-16 items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 text-left shadow-sm transition-colors active:bg-blue-50"
          @click="$emit('open', action.key)"
        >
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <component :is="action.icon" class="h-5 w-5" />
          </span>
          <span class="min-w-0">
            <strong class="block truncate text-sm font-black text-slate-900">{{ action.label }}</strong>
            <span class="block truncate text-[9px] font-bold uppercase text-slate-400">{{ action.hint }}</span>
          </span>
        </button>
      </div>
    </section>

    <section>
      <h2 class="mb-2 px-1 text-sm font-black text-slate-900">Последние отчеты</h2>
      <ArchiveReportsView
        :loading="loading"
        :sections="sections"
        :has-more="hasMore"
        @load-more="$emit('load-more')"
      />
    </section>
  </div>
</template>
