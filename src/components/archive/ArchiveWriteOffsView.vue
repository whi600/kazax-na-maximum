<script setup>
import { BarChart3, PackageSearch } from 'lucide-vue-next'

defineProps({
  loading: { type: Boolean, default: false },
  detailsLoading: { type: Boolean, default: false },
  days: { type: Array, default: () => [] },
  details: { type: Array, default: () => [] },
  selectedDate: { type: String, default: '' },
  selectedLabel: { type: String, default: '' },
  hasMore: { type: Boolean, default: false },
})

const emit = defineEmits(['select-day', 'load-more'])

const handleScroll = (event) => {
  const target = event.currentTarget
  const distanceToEnd = target.scrollWidth - target.clientWidth - target.scrollLeft
  if (distanceToEnd < 80) emit('load-more')
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="loading"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400 animate-pulse"
    >
      Загрузка списаний...
    </div>

    <div
      v-else-if="days.length === 0"
      class="py-10 text-center text-xs font-bold uppercase text-slate-400"
    >
      Списаний пока нет
    </div>

    <template v-else>
      <section class="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center justify-between gap-3 px-3 pt-3">
          <div class="flex items-center gap-2">
            <BarChart3 class="h-4 w-4 text-blue-600" />
            <p class="text-xs font-black uppercase text-slate-700">Списания по дням</p>
          </div>
          <p class="text-[9px] font-black uppercase text-slate-400">Выберите дату</p>
        </div>

        <div class="px-3 pb-3 pt-2">
          <div
            class="flex h-36 items-stretch gap-2 overflow-x-auto pb-1"
            @scroll.passive="handleScroll"
          >
            <button
              v-for="day in days"
              :key="day.date"
              type="button"
              class="flex min-w-11 flex-1 flex-col items-center rounded-lg px-1 py-1 transition-transform active:scale-95"
              @click="emit('select-day', day.date)"
            >
              <span class="flex min-h-0 flex-1 items-end justify-center self-stretch">
                <span
                  class="relative flex w-full max-w-9 items-start justify-center rounded-t-xl rounded-b-md px-1 pt-1.5 shadow-sm transition-all duration-300"
                  :class="selectedDate === day.date ? 'bg-blue-600 text-white shadow-blue-100' : 'bg-slate-200 text-slate-600 shadow-slate-100'"
                  :style="{ height: `${day.heightPercent}%` }"
                >
                  <span class="text-[10px] font-black leading-none">{{ day.totalWriteOff }}</span>
                </span>
              </span>
              <span
                class="mt-2 text-[9px] font-black uppercase"
                :class="selectedDate === day.date ? 'text-blue-600' : 'text-slate-400'"
              >
                {{ day.dateLabel }}
              </span>
            </button>

            <button
              v-if="hasMore"
              type="button"
              class="mb-6 flex min-w-14 items-end justify-center text-center text-[9px] font-black uppercase text-blue-600"
              @click="emit('load-more')"
            >
              Еще даты
            </button>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          <PackageSearch class="h-4 w-4 text-blue-600" />
          <div class="min-w-0">
            <p class="truncate text-xs font-black uppercase text-slate-700">
              {{ selectedLabel || 'Детализация' }}
            </p>
            <p class="text-[9px] font-bold uppercase text-slate-400">Списанные позиции</p>
          </div>
        </div>

        <div v-if="detailsLoading" class="py-7 text-center text-xs font-bold uppercase text-slate-300">
          Загружаем...
        </div>

        <div v-else-if="details.length === 0" class="py-7 text-center text-xs font-bold uppercase text-slate-400">
          В этот день списаний нет
        </div>

        <div v-else class="divide-y divide-slate-100">
          <article v-for="item in details" :key="item.id" class="flex items-center justify-between gap-3 px-3 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-black text-slate-800">{{ item.product_name }}</p>
              <p class="mt-0.5 text-[10px] font-bold uppercase text-slate-400">{{ item.product_unit }}</p>
            </div>
            <p class="shrink-0 text-lg font-black text-red-500">{{ item.write_off }}</p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
