<script setup>
import { Clock3, FileQuestion, History } from 'lucide-vue-next'
import { formatHours, formatShiftDay, formatShiftWeekday } from '../../archiveUtils'
import ArchiveLoadMoreTrigger from './ArchiveLoadMoreTrigger.vue'
import ArchivePageHeader from './ArchivePageHeader.vue'

defineProps({
  employee: { type: Object, default: null },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

defineEmits(['back', 'load-more'])

const requestType = (request) => request.type === 'unbook' ? 'Снятие со смены' : 'Помощь со сменой'
const requestStatus = (status) => ({
  pending: 'Ожидает',
  approved: 'Подтверждена',
  rejected: 'Отклонена',
})[status] || status
</script>

<template>
  <div class="space-y-3">
    <ArchivePageHeader
      :title="employee?.name || 'Сотрудник'"
      subtitle="История работы"
      @back="$emit('back')"
    />

    <div
      v-if="loading && !detail"
      class="py-16 text-center text-[10px] font-black uppercase text-slate-400 animate-pulse"
    >
      Загрузка...
    </div>

    <template v-else-if="detail">
      <section class="grid grid-cols-3 gap-2">
        <div class="rounded-lg border border-slate-100 bg-white px-2 py-3 text-center shadow-sm">
          <strong class="block text-lg font-black text-blue-600">{{ detail.totals?.shifts || 0 }}</strong>
          <span class="text-[8px] font-black uppercase text-slate-400">Смен</span>
        </div>
        <div class="rounded-lg border border-slate-100 bg-white px-2 py-3 text-center shadow-sm">
          <strong class="block text-lg font-black text-blue-600">{{ formatHours(detail.totals?.hours || 0) }}</strong>
          <span class="text-[8px] font-black uppercase text-slate-400">Часов</span>
        </div>
        <div class="rounded-lg border border-slate-100 bg-white px-2 py-3 text-center shadow-sm">
          <strong class="block text-lg font-black text-blue-600">{{ detail.totals?.requests || 0 }}</strong>
          <span class="text-[8px] font-black uppercase text-slate-400">Заявок</span>
        </div>
      </section>

      <section>
        <h3 class="mb-2 flex items-center gap-2 px-1 text-sm font-black text-slate-900">
          <History class="h-4 w-4 text-blue-600" />Смены
        </h3>
        <div v-if="detail.shifts?.length" class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
          <article
            v-for="shift in detail.shifts"
            :key="shift.id"
            class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="text-sm font-black text-slate-900">{{ formatShiftDay(shift.date) }}</p>
              <p class="text-[9px] font-bold uppercase text-slate-400">{{ formatShiftWeekday(shift.date) }}</p>
            </div>
            <span class="flex shrink-0 items-center gap-1.5 text-[11px] font-black text-slate-700">
              <Clock3 class="h-3.5 w-3.5 text-blue-600" />
              {{ shift.start_time }}-{{ shift.end_time }}
            </span>
          </article>
        </div>
        <p v-else class="py-8 text-center text-[10px] font-black uppercase text-slate-400">Смен нет</p>
        <ArchiveLoadMoreTrigger
          :enabled="Boolean(detail.hasMore)"
          :loading="loading"
          label="Показать еще смены"
          @load="$emit('load-more')"
        />
      </section>

      <section v-if="detail.requests?.length">
        <h3 class="mb-2 flex items-center gap-2 px-1 text-sm font-black text-slate-900">
          <FileQuestion class="h-4 w-4 text-blue-600" />Заявки
        </h3>
        <div class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
          <article
            v-for="request in detail.requests"
            :key="`${request.type}-${request.id}`"
            class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="truncate text-xs font-black text-slate-800">{{ requestType(request) }}</p>
              <p class="mt-0.5 text-[9px] font-bold uppercase text-slate-400">
                {{ formatShiftDay(request.date) }} · {{ request.start_time }}-{{ request.end_time }}
              </p>
            </div>
            <span class="shrink-0 text-[9px] font-black uppercase text-slate-500">
              {{ requestStatus(request.status) }}
            </span>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
