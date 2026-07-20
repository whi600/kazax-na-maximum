<script setup>
import { ref, computed } from 'vue';
import { Search, XCircle, Plus, Check } from 'lucide-vue-next';

const props = defineProps({
  products: { type: Array, default: () => [] },
  dailyEntries: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'locked-attempt']);
const searchQuery = ref('');
const selectedCategory = ref('all');
const onlyNotAdded = ref(false);

const categoryOptions = [
  { key: 'all', label: 'Все' },
  { key: 'bakery', label: 'Выпечка' },
  { key: 'pastry', label: 'Кондитерка' },
];

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return props.products.filter((product) => {
    const categoryMatch =
      selectedCategory.value === 'all' || product.category === selectedCategory.value;
    if (!categoryMatch) return false;

    if (onlyNotAdded.value) {
      const alreadyAdded = props.dailyEntries.some((entry) => entry.product_id === product.id);
      if (alreadyAdded) return false;
    }

    if (!query) return true;
    return String(product.name || '').toLowerCase().includes(query);
  });
});

const addProduct = (product) => {
  if (props.disabled) {
    emit('locked-attempt')
    return
  }
  emit('add', product)
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center gap-2">
      <div class="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          v-for="category in categoryOptions"
          :key="category.key"
        @click="selectedCategory = category.key"
        :disabled="disabled"
        class="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border"
          :class="
            selectedCategory === category.key
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-400 border-slate-100'
          "
        >
          {{ category.label }}
        </button>
      </div>

      <button
        type="button"
        @click="onlyNotAdded = !onlyNotAdded"
        :disabled="disabled"
        class="shrink-0 rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase transition-all flex items-center gap-1.5"
        :class="
          onlyNotAdded
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-slate-400 border-slate-100'
        "
      >
        <span
          class="w-3.5 h-3.5 rounded border flex items-center justify-center"
          :class="
            onlyNotAdded
              ? 'border-white bg-white/20'
              : 'border-slate-300 bg-slate-50'
          "
        >
          <Check v-if="onlyNotAdded" class="w-2.5 h-2.5 text-white" />
        </span>
        Не добавл.
      </button>
    </div>

    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input v-model="searchQuery" type="text" placeholder="Поиск товара..." 
        :disabled="disabled"
        class="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold shadow-sm outline-none focus:border-blue-400 transition-all" />
      <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2">
        <XCircle class="w-4 h-4 text-slate-300" />
      </button>
    </div>

    <div class="bg-slate-100/50 p-1.5 rounded-xl">
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button v-for="p in filtered" :key="p.id" @click="addProduct(p)" :aria-disabled="disabled"
          :class="[
            'flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 border shadow-sm flex items-center gap-1',
            dailyEntries.find(e => e.product_id === p.id) 
              ? 'bg-blue-50 border-blue-200 text-blue-600 opacity-60' 
              : 'bg-white border-slate-100 text-slate-400 active:border-blue-300',
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          ]">
          <Check v-if="dailyEntries.find(e => e.product_id === p.id)" class="w-2.5 h-2.5" />
          <Plus v-else class="w-2.5 h-2.5 text-blue-600" />
          {{ p.name }}
        </button>
        <p v-if="filtered.length === 0" class="text-[9px] text-slate-400 font-bold uppercase p-1">Нет совпадений</p>
      </div>
    </div>
  </section>
</template>
