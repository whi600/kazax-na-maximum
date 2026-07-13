<script setup>
import { ChevronRight, Clock3, Search, UserRound } from 'lucide-vue-next'
import { formatHours } from '../../archiveUtils'
import ArchiveLoadMoreTrigger from './ArchiveLoadMoreTrigger.vue'
import ArchivePageHeader from './ArchivePageHeader.vue'

defineProps({
  search: { type: String, default: '' },
  employees: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
})

defineEmits(['back', 'update:search', 'select', 'load-more'])
</script>

<template>
  <div class="space-y-3">
    <ArchivePageHeader title="Сотрудники" :subtitle="`${total} в списке`" @back="$emit('back')" />

    <label class="relative block">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        :value="search"
        type="search"
        inputmode="search"
        placeholder="Найти сотрудника"
        class="h-11 w-full rounded-lg border border-slate-100 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 outline-none shadow-sm focus:border-blue-300"
        @input="$emit('update:search', $event.target.value)"
      />
    </label>

    <div
      v-if="loading && employees.length === 0"
      class="py-16 text-center text-[10px] font-black uppercase text-slate-400 animate-pulse"
    >
      Загрузка...
    </div>
    <p
      v-else-if="employees.length === 0"
      class="py-16 text-center text-[10px] font-black uppercase text-slate-400"
    >
      Никого не найдено
    </p>

    <div v-else class="space-y-2">
      <button
        v-for="employee in employees"
        :key="employee.key"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 text-left shadow-sm active:bg-blue-50"
        @click="$emit('select', employee)"
      >
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
          <UserRound class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <strong class="block truncate text-sm font-black text-slate-900">{{ employee.name }}</strong>
          <span class="mt-0.5 flex items-center gap-2 text-[9px] font-black uppercase text-slate-400">
            <span>{{ employee.shiftsCount }} смен</span>
            <span class="flex items-center gap-1"><Clock3 class="h-3 w-3" />{{ formatHours(employee.hours) }} ч</span>
            <span v-if="employee.requestsCount">{{ employee.requestsCount }} заявок</span>
          </span>
        </span>
        <ChevronRight class="h-4 w-4 shrink-0 text-slate-300" />
      </button>
    </div>

    <ArchiveLoadMoreTrigger
      :enabled="hasMore"
      :loading="loading"
      label="Показать еще сотрудников"
      @load="$emit('load-more')"
    />
  </div>
</template>
