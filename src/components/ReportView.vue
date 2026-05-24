<script setup>
import { computed, ref } from 'vue'
import { ChefHat, ChevronDown, LayoutGrid, ShoppingBasket } from 'lucide-vue-next'
import EntryCard from './EntryCard.vue'
import ProductSelector from './ProductSelector.vue'

const props = defineProps({
  products: { type: Array, default: () => [] },
  dailyEntries: { type: Array, default: () => [] },
  editable: { type: Boolean, default: true },
})

const emit = defineEmits(['add-product', 'remove-entry'])

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

      <div v-for="category in categories" :key="category.key" class="space-y-1.5">
        <button
          v-if="groupedEntries[category.key].length"
          type="button"
          @click="toggleGroup(category.key)"
          class="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
          :aria-expanded="!isGroupCollapsed(category.key)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <component :is="category.icon" class="w-4 h-4" />
            </span>
            <span class="min-w-0 text-left">
              <span class="block text-[12px] font-black text-slate-800 uppercase tracking-[0.08em]">
                {{ category.label }}
              </span>
              <span class="block text-[9px] font-black text-slate-400 uppercase">
                {{ groupedEntries[category.key].length }} поз.
              </span>
            </span>
          </span>
          <ChevronDown
            class="w-4 h-4 text-slate-400 transition-transform duration-300"
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
