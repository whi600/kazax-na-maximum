<script setup>
import { computed, ref } from 'vue'
import { ChefHat, ChevronDown, CheckCircle2, LayoutGrid, ShoppingBasket } from 'lucide-vue-next'
import EntryCard from './EntryCard.vue'
import ProductSelector from './ProductSelector.vue'

const props = defineProps({
  products: { type: Array, default: () => [] },
  dailyEntries: { type: Array, default: () => [] },
  editable: { type: Boolean, default: true },
  reportCompleted: { type: Boolean, default: false },
  reportCompletedAt: { type: String, default: '' },
  reportCompletedByName: { type: String, default: '' },
  reportCompleting: { type: Boolean, default: false },
})

const emit = defineEmits(['add-product', 'remove-entry', 'complete-report'])

const categories = [
  { key: 'bakery', label: 'Выпечка', icon: ShoppingBasket },
  { key: 'pastry', label: 'Кондитерка', icon: ChefHat },
  { key: 'other', label: 'Другое', icon: LayoutGrid },
]

const collapsedGroups = ref({})

const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [], other: [] }

  props.dailyEntries.forEach((entry) => {
    if (entry.category === 'bakery' || entry.category === 'pastry') {
      groups[entry.category].push(entry)
    } else {
      groups.other.push(entry)
    }
  })

  return groups
})

const isGroupCollapsed = (key) => Boolean(collapsedGroups.value[key])

const toggleGroup = (key) => {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [key]: !collapsedGroups.value[key],
  }
}

const reportStatusText = computed(() => {
  if (!props.reportCompleted) return 'Черновик'
  if (props.reportCompletedByName) return `Готов • ${props.reportCompletedByName}`
  return 'Готов'
})
</script>

<template>
  <div class="space-y-4 page-fade page-stack">
    <div class="space-y-4 page-stack">
      <ProductSelector
        :products="products"
        :dailyEntries="dailyEntries"
        :disabled="!editable"
        @add="emit('add-product', $event)"
      />

      <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
        <div class="min-w-0">
          <p class="text-[9px] font-black uppercase tracking-widest text-slate-300">
            Статус отчета
          </p>
          <p
            class="text-xs font-black"
            :class="reportCompleted ? 'text-emerald-600' : 'text-slate-500'"
          >
            {{ reportStatusText }}
          </p>
        </div>
        <button
          v-if="editable"
          type="button"
          :disabled="reportCompleting"
          @click="emit('complete-report')"
          class="shrink-0 rounded-lg px-3 py-2 text-[10px] font-black uppercase transition-all active:scale-95 disabled:opacity-50"
          :class="
            reportCompleted
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              : 'bg-blue-600 text-white shadow-sm shadow-blue-100'
          "
        >
          <span class="inline-flex items-center gap-1.5">
            <CheckCircle2 class="h-3.5 w-3.5" />
            {{ reportCompleting ? 'Сохраняем...' : reportCompleted ? 'Готов' : 'Отчет готов' }}
          </span>
        </button>
      </div>

      <div v-for="category in categories" :key="category.key" class="space-y-1">
        <button
          v-if="groupedEntries[category.key].length"
          type="button"
          @click="toggleGroup(category.key)"
          class="w-full pt-2 pb-1 ml-1 pr-2 flex items-center justify-start gap-3 active:opacity-70 transition-opacity"
          :aria-expanded="!isGroupCollapsed(category.key)"
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <component :is="category.icon" class="w-3 h-3 text-blue-600" />
            <span class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">
              {{ category.label }}
            </span>
            <span class="text-[8px] font-black text-slate-300 uppercase">
              {{ groupedEntries[category.key].length }}
            </span>
          </span>
          <ChevronDown
            class="w-3.5 h-3.5 text-slate-300 transition-transform duration-300"
            :class="isGroupCollapsed(category.key) ? '-rotate-90' : 'rotate-0'"
          />
        </button>

        <div
          v-if="groupedEntries[category.key].length"
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
          :class="isGroupCollapsed(category.key) ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'"
        >
          <div class="overflow-hidden">
            <EntryCard
              v-for="item in groupedEntries[category.key]"
              :key="item.product_id"
              :item="item"
              :editable="editable"
              @remove="emit('remove-entry', item)"
            />
          </div>
        </div>
      </div>

      <div v-if="dailyEntries.length === 0" class="text-center py-10 opacity-20">
        <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
        <p class="text-[10px] font-black uppercase">Нет товаров в отчете</p>
      </div>
    </div>
  </div>
</template>
