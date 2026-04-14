<script setup>
import { AlertCircle, CheckCircle2 } from 'lucide-vue-next';
defineProps(['entries']);

const getStatus = (count) => {
  if (count <= 2) return { class: 'bg-red-50 text-red-600 border-red-100', icon: AlertCircle };
  if (count <= 5) return { class: 'bg-amber-50 text-amber-600 border-amber-100', icon: AlertCircle };
  return { class: 'bg-green-50 text-green-600 border-green-100', icon: CheckCircle2 };
};
</script>

<template>
  <div class="grid gap-1.5">
    <div v-for="item in entries" :key="item.product_id" 
         class="bg-white px-4 py-2.5 rounded-xl flex justify-between items-center shadow-sm border border-slate-50">
      <span class="text-[12px] font-bold text-slate-700">{{ item.name }}</span>
      
      <div class="flex items-center gap-2">
        <div :class="['px-2.5 py-1 rounded-lg border font-black text-[11px]', getStatus(item.remainder).class]">
          {{ item.remainder }} шт.
        </div>
        <component :is="getStatus(item.remainder).icon" 
          :class="['w-3.5 h-3.5', item.remainder <= 2 ? 'text-red-500 animate-pulse' : 'text-green-500']" />
      </div>
    </div>
  </div>
</template>