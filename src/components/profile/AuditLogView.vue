<script setup>
import { ArrowLeft, History, RefreshCw } from 'lucide-vue-next'
import { onMounted } from 'vue'
import AuditTimelineList from './AuditTimelineList.vue'
import { useAuditLog } from './composables/useAuditLog'

const emit = defineEmits(['back'])
const {
  entries,
  error,
  hasMore,
  loading,
  loadingMore,
  loadMore,
  reload,
} = useAuditLog()

onMounted(reload)
</script>

<template>
  <section class="space-y-4 page-stack">
    <header class="px-2 pt-2">
      <button
        type="button"
        @click="emit('back')"
        class="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        Профиль
      </button>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-black uppercase italic text-slate-800">Журнал изменений</h2>
          <p class="mt-1 max-w-xs text-xs font-bold leading-relaxed text-slate-400">
            Значимые действия с отчётами, графиком, ассортиментом и доступами.
          </p>
        </div>
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <History class="h-5 w-5" />
        </span>
      </div>
    </header>

    <div v-if="loading" class="space-y-2 px-2 animate-pulse">
      <div v-for="index in 5" :key="index" class="h-20 rounded-xl bg-slate-100" />
    </div>

    <div v-else-if="error" class="mx-2 rounded-xl border border-red-100 bg-red-50 p-4 text-center">
      <p class="text-xs font-black text-red-600">{{ error }}</p>
      <button
        type="button"
        class="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-red-600"
        @click="reload"
      >
        <RefreshCw class="h-3.5 w-3.5" /> Повторить
      </button>
    </div>

    <template v-else>
      <AuditTimelineList v-if="entries.length" :entries="entries" />
      <div v-else class="mx-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
        <p class="text-xs font-black text-slate-400">Событий пока нет</p>
      </div>

      <button
        v-if="hasMore"
        type="button"
        :disabled="loadingMore"
        class="mx-auto flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[10px] font-black uppercase text-white disabled:opacity-60"
        @click="loadMore"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loadingMore }" />
        {{ loadingMore ? 'Загружаем' : 'Показать ещё' }}
      </button>
    </template>
  </section>
</template>
