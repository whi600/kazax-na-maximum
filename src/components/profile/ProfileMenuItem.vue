<script setup>
import { ChevronRight } from 'lucide-vue-next'

defineProps({
  icon: { type: [Object, Function], required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  badge: { type: String, default: '' },
})

const emit = defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm transition-colors active:bg-slate-50"
    @click="emit('select')"
  >
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
      <component :is="icon" class="h-5 w-5" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-black leading-tight text-slate-800">{{ title }}</span>
      <span v-if="description" class="mt-0.5 block truncate text-[10px] font-bold text-slate-400">
        {{ description }}
      </span>
    </span>
    <span
      v-if="badge"
      class="shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-[8px] font-black uppercase text-slate-500"
    >
      {{ badge }}
    </span>
    <ChevronRight class="h-4 w-4 shrink-0 text-slate-300" />
  </button>
</template>
