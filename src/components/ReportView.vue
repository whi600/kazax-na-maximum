<script setup>
import { computed } from 'vue'
import { ChefHat, LayoutGrid, ShoppingBasket } from 'lucide-vue-next'
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
        <h3
          v-if="groupedEntries[category.key].length"
          class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] pt-2 pb-1 ml-1 flex items-center gap-1"
        >
          <component :is="category.icon" class="w-2.5 h-2.5" />
          {{ category.label }}
        </h3>

        <EntryCard
          v-for="item in groupedEntries[category.key]"
          :key="item.product_id"
          :item="item"
          :editable="editable"
          @remove="emit('remove-entry', item)"
        />
      </div>

      <div v-if="dailyEntries.length === 0" class="text-center py-10 opacity-20">
        <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
        <p class="text-[10px] font-black uppercase">Нет товаров в отчете</p>
      </div>
    </div>
  </div>
</template>
