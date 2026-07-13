<script setup>
import { computed } from 'vue'
import { BarChart3, Clock3, PackageOpen, UsersRound } from 'lucide-vue-next'
import { formatDateLabel, formatHours } from '../../archiveUtils'
import NativeDateButton from '../shared/NativeDateButton.vue'
import ArchivePageHeader from './ArchivePageHeader.vue'

const props = defineProps({
  start: { type: String, required: true },
  end: { type: String, required: true },
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

defineEmits(['back', 'update:start', 'update:end', 'open-write-offs'])

const categoryLabels = {
  pastry: 'Кондитерка',
  bakery: 'Выпечка',
  other: 'Другое',
}

const groupedProducts = computed(() => {
  const groups = new Map()
  for (const product of props.data?.products || []) {
    const category = product.category || 'other'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(product)
  }
  return ['pastry', 'bakery', 'other']
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      label: categoryLabels[category],
      products: groups.get(category),
    }))
})
</script>

<template>
  <div class="space-y-3">
    <ArchivePageHeader title="Итоги периода" subtitle="Смены и продукция" @back="$emit('back')" />

    <section class="grid grid-cols-2 gap-2">
      <NativeDateButton
        :model-value="start"
        label="Начало"
        :display-value="formatDateLabel(start)"
        @update:model-value="$emit('update:start', $event)"
      />
      <NativeDateButton
        :model-value="end"
        label="Конец"
        :display-value="formatDateLabel(end)"
        @update:model-value="$emit('update:end', $event)"
      />
    </section>

    <div
      v-if="loading && !data"
      class="py-16 text-center text-[10px] font-black uppercase text-slate-400 animate-pulse"
    >
      Считаем итоги...
    </div>

    <template v-else-if="data">
      <section class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          <UsersRound class="h-4 w-4 text-blue-600" />
          <strong class="mt-2 block text-xl font-black text-slate-900">{{ data.totals.shifts }}</strong>
          <span class="text-[9px] font-black uppercase text-slate-400">Смен</span>
        </div>
        <div class="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          <Clock3 class="h-4 w-4 text-blue-600" />
          <strong class="mt-2 block text-xl font-black text-slate-900">{{ formatHours(data.totals.hours) }}</strong>
          <span class="text-[9px] font-black uppercase text-slate-400">Часов</span>
        </div>
        <div class="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          <PackageOpen class="h-4 w-4 text-emerald-600" />
          <strong class="mt-2 block text-xl font-black text-slate-900">{{ data.totals.arrival }}</strong>
          <span class="text-[9px] font-black uppercase text-slate-400">Поступило</span>
        </div>
        <button
          type="button"
          class="rounded-lg border border-slate-100 bg-white p-3 text-left shadow-sm active:bg-blue-50"
          @click="$emit('open-write-offs')"
        >
          <BarChart3 class="h-4 w-4 text-red-500" />
          <strong class="mt-2 block text-xl font-black text-slate-900">{{ data.totals.writeOff }}</strong>
          <span class="text-[9px] font-black uppercase text-slate-400">Списано · график</span>
        </button>
      </section>

      <section>
        <h3 class="mb-2 px-1 text-sm font-black text-slate-900">Сотрудники</h3>
        <div v-if="data.employees?.length" class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
          <article
            v-for="employee in data.employees"
            :key="employee.key"
            class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-black text-slate-900">{{ employee.name }}</p>
              <p class="text-[9px] font-bold uppercase text-slate-400">{{ employee.shiftsCount }} смен</p>
            </div>
            <strong class="shrink-0 text-sm font-black text-blue-600">{{ formatHours(employee.hours) }} ч</strong>
          </article>
        </div>
        <p v-else class="py-6 text-center text-[10px] font-black uppercase text-slate-400">Смен нет</p>
      </section>

      <section>
        <h3 class="mb-2 px-1 text-sm font-black text-slate-900">Продукция</h3>
        <div v-if="groupedProducts.length" class="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
          <table class="w-full table-fixed text-xs">
            <thead>
              <tr class="text-[9px] font-black uppercase text-slate-400">
                <th class="w-[43%] border-b border-r border-slate-100 px-2 py-2 text-left">Продукт</th>
                <th class="w-[19%] border-b border-r border-slate-100 px-1 py-2 text-right">Приход</th>
                <th class="w-[19%] border-b border-r border-slate-100 px-1 py-2 text-right">Остаток</th>
                <th class="w-[19%] border-b border-slate-100 px-1 py-2 text-right">Списано</th>
              </tr>
            </thead>
            <tbody v-for="group in groupedProducts" :key="group.category">
              <tr>
                <th colspan="4" class="border-t-2 border-slate-300 bg-slate-50 px-2 py-2 text-left text-[9px] font-black uppercase text-slate-500">
                  {{ group.label }}
                </th>
              </tr>
              <tr v-for="product in group.products" :key="product.productId" class="border-t border-slate-100 font-bold">
                <td class="border-r border-slate-100 px-2 py-2.5 text-slate-800">{{ product.name }}</td>
                <td class="border-r border-slate-100 px-1 py-2.5 text-right text-blue-600">{{ product.arrival }}</td>
                <td class="border-r border-slate-100 px-1 py-2.5 text-right text-slate-700">{{ product.latestRemainder }}</td>
                <td class="px-1 py-2.5 text-right text-red-500">{{ product.writeOff }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="py-6 text-center text-[10px] font-black uppercase text-slate-400">Отчетов нет</p>
      </section>
    </template>
  </div>
</template>
