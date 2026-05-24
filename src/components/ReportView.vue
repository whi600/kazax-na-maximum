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

      <div v-for="category in categories" :key="category.key" class="space-y-1">
        <button
          v-if="groupedEntries[category.key].length"
          type="button"
          @click="toggleGroup(category.key)"
          class="w-full pt-2 pb-1 ml-1 pr-2 flex items-center justify-between gap-3 active:opacity-70 transition-opacity"
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
