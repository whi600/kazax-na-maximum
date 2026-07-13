<script setup>
import { Clock3 } from 'lucide-vue-next'
import { useNativeInputPicker } from './useNativeInputPicker'

defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])
const { input: timeInput, openPicker } = useNativeInputPicker()
</script>

<template>
  <label
    class="relative flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-blue-400"
    @click="openPicker"
  >
    <span class="mb-1 text-[9px] font-black uppercase text-slate-400">{{ label }}</span>
    <span class="flex items-center justify-between gap-2 text-sm font-black text-slate-800">
      <span>{{ modelValue || '--:--' }}</span>
      <Clock3 class="h-4 w-4 shrink-0 text-blue-600" />
    </span>
    <input
      ref="timeInput"
      type="time"
      :value="modelValue"
      :aria-label="label"
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      @input="emit('update:modelValue', $event.target.value)"
      @change="emit('update:modelValue', $event.target.value)"
    />
  </label>
</template>
