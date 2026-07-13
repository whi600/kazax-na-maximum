<script setup>
import ArchiveLoadMoreTrigger from './ArchiveLoadMoreTrigger.vue'

defineProps({
  loading: { type: Boolean, default: false },
  logs: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
  formatDateTimeLabel: { type: Function, required: true },
  formatAuditAction: { type: Function, required: true },
  formatAuditEntity: { type: Function, required: true },
  formatAuditSummary: { type: Function, required: true },
})

const emit = defineEmits(['load-more'])
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="loading"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400 animate-pulse"
    >
      Загрузка изменений...
    </div>

    <div
      v-else-if="logs.length === 0"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400"
    >
      Изменений пока нет
    </div>

    <template v-else>
      <article
        v-for="log in logs"
        :key="log.id"
        class="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-black uppercase text-slate-800">{{ formatAuditAction(log.action) }}</p>
          <p class="text-[9px] font-black text-slate-400">{{ formatDateTimeLabel(log.created_at) }}</p>
        </div>
        <p class="mt-1 text-[10px] font-black uppercase text-blue-600">
          {{ log.actor_name }} • {{ formatAuditEntity(log.entity_type) }}<span v-if="log.entity_id"> #{{ log.entity_id }}</span>
        </p>
        <p v-if="formatAuditSummary(log)" class="mt-1 text-[10px] font-bold text-slate-500">
          {{ formatAuditSummary(log) }}
        </p>
      </article>

      <ArchiveLoadMoreTrigger
        :enabled="hasMore"
        :loading="loading"
        label="Показать более ранние изменения"
        @load="emit('load-more')"
      />
    </template>
  </div>
</template>
