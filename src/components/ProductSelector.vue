<script setup>
import { ref, computed } from 'vue';
import { Search, XCircle, Plus, Check } from 'lucide-vue-next';

const props = defineProps(['products', 'dailyEntries']);
const emit = defineEmits(['add']);
const searchQuery = ref('');

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return props.products;
  return props.products.filter(p => p.name.toLowerCase().includes(searchQuery.value.toLowerCase()));
});
</script>

<template>
  <section class="space-y-3">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input v-model="searchQuery" type="text" placeholder="Поиск товара..." 
        class="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold shadow-sm outline-none focus:border-blue-400 transition-all" />
      <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-1/2 -translate-y-1/2">
        <XCircle class="w-4 h-4 text-slate-300" />
      </button>
    </div>

    <div class="bg-slate-100/50 p-1.5 rounded-xl">
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button v-for="p in filtered" :key="p.id" @click="emit('add', p)"
          :class="[
            'flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 border shadow-sm flex items-center gap-1',
            dailyEntries.find(e => e.product_id === p.id) 
              ? 'bg-blue-50 border-blue-200 text-blue-500 opacity-60' 
              : 'bg-white border-slate-100 text-slate-600 active:border-blue-300'
          ]">
          <Check v-if="dailyEntries.find(e => e.product_id === p.id)" class="w-2.5 h-2.5" />
          <Plus v-else class="w-2.5 h-2.5 text-blue-500" />
          {{ p.name }}
        </button>
        <p v-if="filtered.length === 0" class="text-[9px] text-slate-400 font-bold uppercase p-1">Нет совпадений</p>
      </div>
    </div>
  </section>
</template>