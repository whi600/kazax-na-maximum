<script setup>
import { Calendar } from 'lucide-vue-next'
import ArchiveLoadMoreTrigger from './ArchiveLoadMoreTrigger.vue'

defineProps({
  loading: { type: Boolean, default: false },
  sections: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
})

const emit = defineEmits(['load-more'])
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="loading"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400 animate-pulse"
    >
      Загрузка истории...
    </div>

    <div
      v-else-if="sections.length === 0"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400"
    >
      Архив пуст
    </div>

    <template v-else>
      <section
        v-for="section in sections"
        :key="section.key"
        class="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        <div class="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Calendar class="h-5 w-5 text-blue-600" />
          <span class="text-xs font-black uppercase tracking-normal text-slate-500">
            {{ section.dateLabel }} • {{ section.weekDayLabel }}
          </span>
        </div>
        <div class="p-3">
          <table class="w-full table-fixed text-sm">
            <thead>
              <tr class="text-[11px] font-black uppercase text-slate-500">
                <th class="w-[43%] border-b border-r border-slate-100 px-2.5 py-2.5 text-left">Продукт</th>
                <th class="w-[19%] border-b border-r border-slate-100 px-1.5 py-2.5 text-right">Приход</th>
                <th class="w-[19%] border-b border-r border-slate-100 px-1.5 py-2.5 text-right">Остаток</th>
                <th class="w-[19%] border-b border-slate-100 px-1.5 py-2.5 text-right">Списание</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in section.rows"
                :key="record.id"
                :class="[
                  record.rowType === 'category' ? 'font-black' : 'font-bold',
                  record.hasCategoryDivider ? 'border-t-[3px] border-slate-300' : 'border-t border-slate-100',
                ]"
              >
                <td
                  v-if="record.rowType === 'category'"
                  colspan="4"
                  class="bg-slate-50 px-2.5 py-2 text-[12px] uppercase tracking-[0.12em] text-slate-500"
                >
                  {{ record.categoryLabel }}
                </td>
                <template v-else>
                  <td class="border-r border-slate-100 px-2.5 py-3 leading-tight text-slate-900">
                    {{ record.products?.name || 'Удален' }}
                  </td>
                  <td class="border-r border-slate-100 px-1.5 py-3 text-right text-blue-600">{{ record.arrival }}</td>
                  <td class="border-r border-slate-100 px-1.5 py-3 text-right text-slate-800">{{ record.remainder }}</td>
                  <td class="px-1.5 py-3 text-right text-red-500">{{ record.write_off }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ArchiveLoadMoreTrigger
        :enabled="hasMore"
        :loading="loading"
        label="Показать более ранние отчеты"
        @load="emit('load-more')"
      />
    </template>
  </div>
</template>
