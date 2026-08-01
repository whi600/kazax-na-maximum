<script setup>
import { computed } from 'vue'
import { CalendarDays, CheckCircle2, Clock3, History, UsersRound } from 'lucide-vue-next'
import {
  formatAuditAction,
  formatAuditEntity,
  formatAuditSummary,
} from '../../audit/auditPresentation'
import { formatDateLabel } from '../../archiveUtils'
import ArchivePageHeader from './ArchivePageHeader.vue'
import ArchiveReportsView from './ArchiveReportsView.vue'

const props = defineProps({
  date: { type: String, required: true },
  data: { type: Object, default: null },
  sections: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['back'])

const title = computed(() => formatDateLabel(props.date))
const weekday = computed(() => {
  if (!props.date) return ''
  return new Date(`${props.date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long' })
})
</script>

<template>
  <div class="space-y-3">
    <ArchivePageHeader :title="title" :subtitle="weekday" @back="$emit('back')" />

    <div
      v-if="loading"
      class="py-16 text-center text-[10px] font-black uppercase text-slate-400 animate-pulse"
    >
      Загрузка дня...
    </div>

    <template v-else-if="data">
      <section class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 px-3 py-3">
          <span class="flex items-center gap-2 text-xs font-black text-slate-800">
            <UsersRound class="h-4 w-4 text-blue-600" />
            Смены
          </span>
          <span class="text-[10px] font-black uppercase text-slate-400">
            {{ data.shifts?.length || 0 }}
          </span>
        </div>
        <div v-if="data.shifts?.length" class="divide-y divide-slate-100">
          <article
            v-for="shift in data.shifts"
            :key="shift.id"
            class="flex items-center justify-between gap-3 px-3 py-3"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-black text-slate-900">
                {{ shift.employee_name || 'Свободная смена' }}
              </p>
              <p class="mt-0.5 text-[9px] font-bold uppercase text-slate-400">
                {{ shift.status === 'pending' ? 'Заявка' : 'Подтверждена' }}
              </p>
            </div>
            <span class="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white">
              <Clock3 class="h-3.5 w-3.5" />
              {{ shift.start_time }}-{{ shift.end_time }}
            </span>
          </article>
        </div>
        <p v-else class="px-3 py-5 text-center text-[10px] font-black uppercase text-slate-400">
          Смен не было
        </p>
      </section>

      <section class="overflow-hidden rounded-lg border border-violet-100 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-violet-100 px-3 py-3">
          <span class="flex items-center gap-2 text-xs font-black text-slate-800">
            <CalendarDays class="h-4 w-4 text-violet-600" />
            События
          </span>
          <span class="text-[10px] font-black uppercase text-slate-400">
            {{ data.events?.length || 0 }}
          </span>
        </div>
        <div v-if="data.events?.length" class="divide-y divide-violet-50">
          <article v-for="event in data.events" :key="event.id" class="px-3 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-black text-slate-900">{{ event.title }}</p>
                <p v-if="event.description" class="mt-1 text-xs font-semibold text-slate-500">
                  {{ event.description }}
                </p>
              </div>
              <span
                v-if="event.start_time"
                class="shrink-0 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-700"
              >
                {{ event.start_time }}-{{ event.end_time }}
              </span>
            </div>
          </article>
        </div>
        <p v-else class="px-3 py-5 text-center text-[10px] font-black uppercase text-slate-400">
          Событий нет
        </p>
      </section>

      <div class="flex items-center justify-between px-1">
        <h3 class="text-sm font-black text-slate-900">Отчет</h3>
        <span
          v-if="data.reportStatus?.completed"
          class="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600"
        >
          <CheckCircle2 class="h-3.5 w-3.5" />Готов
        </span>
        <span v-else class="text-[9px] font-black uppercase text-slate-400">Черновик</span>
      </div>
      <ArchiveReportsView :sections="sections" :has-more="false" />

      <details
        v-if="data.changes?.length"
        class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm"
      >
        <summary class="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-black text-slate-700">
          <History class="h-4 w-4 text-orange-500" />
          Изменения за день · {{ data.changes.length }}
        </summary>
        <div class="divide-y divide-slate-100 border-t border-slate-100">
          <article v-for="log in data.changes" :key="log.id" class="px-3 py-2.5">
            <p class="text-xs font-black text-slate-800">
              {{ formatAuditAction(log) }} · {{ formatAuditEntity(log.entity_type) }}
            </p>
            <p class="mt-0.5 text-[10px] font-semibold text-slate-400">
              {{ log.actor_name }} · {{ formatAuditSummary(log) }}
            </p>
          </article>
        </div>
      </details>
    </template>
  </div>
</template>
