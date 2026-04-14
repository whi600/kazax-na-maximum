<script setup>
import { Trash2 } from 'lucide-vue-next';
const props = defineProps(['item']);
const emit = defineEmits(['remove']);

const handleEnter = (e) => { e.target.blur(); };
</script>

<template>
  <div class="bg-white rounded-xl mb-1 border border-slate-100 shadow-sm p-1.5 flex items-center gap-2">
    <div class="flex-1 min-w-0">
      <p class="text-[12px] font-black text-slate-700 truncate leading-tight ml-1">{{ item.name }}</p>
    </div>

    <div class="flex items-center gap-1 shrink-0">
      <div v-for="field in ['arrival', 'remainder', 'write_off']" :key="field">
        <input 
          type="number" 
          v-model.number="item[field]" 
          @keydown.enter="handleEnter"
          inputmode="numeric"
          :placeholder="field === 'arrival' ? 'Приход' : field === 'remainder' ? 'Ост' : 'Спис'"
          class="w-12 bg-slate-50 border border-slate-100 rounded-lg py-1.5 text-center font-black text-[11px] outline-none transition-all placeholder:font-bold placeholder:text-slate-300"
          :class="{
            'text-blue-600 border-blue-200 bg-blue-50/40': field === 'arrival' && item[field] > 0,
            'text-green-600 border-green-200 bg-green-50/40': field === 'remainder' && item[field] > 0,
            'text-red-500 border-red-200 bg-red-50/40': field === 'write_off' && item[field] > 0,
            'text-slate-400': !item[field]
          }"
        />
      </div>

      <button 
        @click="$emit('remove')"
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 active:bg-red-500 active:text-white transition-all ml-1 shrink-0"
      >
        <Trash2 class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Убираем стрелочки у инпутов */
input::-webkit-outer-spin-button, 
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }
</style>