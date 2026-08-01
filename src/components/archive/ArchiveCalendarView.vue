<script setup>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ArchivePageHeader from './ArchivePageHeader.vue'

defineProps({
  monthLabel: { type: String, required: true },
  cells: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['back', 'change-month', 'select-day'])

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
</script>

<template>
  <div class="space-y-3">
    <ArchivePageHeader title="Архив по дням" subtitle="Отчеты и смены" @back="$emit('back')" />

    <section class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-100 px-2 py-2">
        <button
          type="button"
          class="grid h-10 w-10 place-items-center rounded-lg text-slate-500 active:bg-slate-100"
          aria-label="Предыдущий месяц"
          @click="$emit('change-month', -1)"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <h3 class="text-sm font-black capitalize text-slate-900">{{ monthLabel }}</h3>
        <button
          type="button"
          class="grid h-10 w-10 place-items-center rounded-lg text-slate-500 active:bg-slate-100"
          aria-label="Следующий месяц"
          @click="$emit('change-month', 1)"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>

      <div class="grid grid-cols-7 border-b border-slate-100 px-2 pt-2">
        <span
          v-for="day in weekDays"
          :key="day"
          class="pb-2 text-center text-[9px] font-black uppercase text-slate-400"
        >{{ day }}</span>
      </div>

      <div class="relative grid min-h-64 grid-cols-7 gap-1 p-2">
        <div v-for="cell in cells" :key="cell.key" class="aspect-square min-w-0">
          <button
            v-if="!cell.empty"
            type="button"
            class="relative flex h-full w-full flex-col items-center justify-center rounded-lg text-sm font-black transition-colors active:bg-blue-50"
            :class="cell.isToday ? 'bg-blue-600 text-white' : 'text-slate-700'"
            @click="$emit('select-day', cell.date)"
          >
            {{ cell.day }}
            <span class="absolute bottom-1.5 flex h-1.5 items-center gap-0.5">
              <i v-if="cell.hasReport" class="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <i v-if="cell.shiftsCount" class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <i v-if="cell.eventsCount" class="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <i v-if="cell.changesCount" class="h-1.5 w-1.5 rounded-full bg-orange-400" />
            </span>
          </button>
        </div>
        <div
          v-if="loading"
          class="absolute inset-0 grid place-items-center bg-white/80 text-[10px] font-black uppercase text-slate-400"
        >
          Загрузка...
        </div>
      </div>
    </section>

    <div class="flex flex-wrap gap-x-4 gap-y-2 px-1 text-[9px] font-black uppercase text-slate-400">
      <span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-blue-400" />Отчет</span>
      <span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-emerald-400" />Смены</span>
      <span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-violet-400" />События</span>
      <span class="flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-orange-400" />Изменения</span>
    </div>
  </div>
</template>
