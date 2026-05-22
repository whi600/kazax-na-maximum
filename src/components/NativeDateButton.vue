<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  displayValue: { type: String, default: '' },
  min: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <label class="relative block cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
    <span class="block text-[9px] font-black uppercase text-slate-400 mb-1">{{ label }}</span>
    <span class="block text-[11px] font-bold text-slate-800">{{ displayValue }}</span>
    <input
      type="date"
      :value="modelValue"
      :min="min || undefined"
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      @input="emit('update:modelValue', $event.target.value)"
      @change="emit('update:modelValue', $event.target.value)"
    />
  </label>
</template>
