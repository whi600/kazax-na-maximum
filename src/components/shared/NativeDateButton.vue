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
  <label class="block rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
    <span class="block text-[9px] font-black uppercase text-slate-400 mb-1">{{ label }}</span>
    <input
      type="date"
      :value="modelValue"
      :min="min || undefined"
      class="block w-full rounded-lg border border-slate-100 bg-white px-2 py-2 text-[11px] font-bold text-slate-800 outline-none focus:border-blue-300"
      @input="emit('update:modelValue', $event.target.value)"
      @change="emit('update:modelValue', $event.target.value)"
    />
    <span v-if="displayValue" class="mt-1 block text-[10px] font-bold text-slate-400">
      {{ displayValue }}
    </span>
  </label>
</template>
