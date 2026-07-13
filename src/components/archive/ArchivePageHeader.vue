<script setup>
import { ArrowLeft } from 'lucide-vue-next'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})

defineEmits(['back'])
</script>

<template>
  <header class="flex min-h-11 items-center gap-3 px-1">
    <button
      type="button"
      class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm active:bg-slate-100"
      aria-label="Назад"
      @click="$emit('back')"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <div class="min-w-0">
      <h2 class="truncate text-base font-black text-slate-900">{{ title }}</h2>
      <p v-if="subtitle" class="truncate text-[10px] font-bold uppercase text-slate-400">
        {{ subtitle }}
      </p>
    </div>
  </header>
</template>
