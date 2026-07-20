<script setup>
import { Trash2 } from 'lucide-vue-next';
const props = defineProps({
  item: { type: Object, required: true },
  editable: { type: Boolean, default: true },
});
const emit = defineEmits(['remove', 'locked-attempt']);

const blockWhenLocked = (event) => {
  if (props.editable) return false
  event?.preventDefault?.()
  emit('locked-attempt')
  return true
}

const handleEnter = (event) => {
  if (blockWhenLocked(event)) return
  const inputs = Array.from(document.querySelectorAll('.report-entry-input:not(:disabled)'))
  const currentIndex = inputs.indexOf(event.target)
  const nextInput = inputs[currentIndex + 1]

  if (nextInput) {
    nextInput.focus()
    nextInput.select?.()
    return
  }

  event.target.blur()
}

const selectInputValue = (event) => {
  if (blockWhenLocked(event)) return
  event.target.select?.()
}

const handleRemove = (event) => {
  if (blockWhenLocked(event)) return
  emit('remove')
}
</script>

<template>
  <div class="bg-white rounded-xl mb-1 border border-slate-100 shadow-sm p-1.5 flex items-center gap-2">
    <div class="flex-1 min-w-0">
      <p class="text-[12px] font-black text-slate-800 truncate leading-tight ml-1">{{ item.name }}</p>
    </div>

    <div class="flex items-center gap-1 shrink-0">
      <div v-for="field in ['arrival', 'remainder', 'write_off']" :key="field">
        <input 
          type="number" 
          v-model.number="item[field]" 
          :readonly="!editable"
          :aria-readonly="!editable"
          @pointerdown="blockWhenLocked"
          @keydown.enter="handleEnter"
          @focus="selectInputValue"
          inputmode="numeric"
          :placeholder="field === 'arrival' ? 'Приход' : field === 'remainder' ? 'Ост' : 'Спис'"
          class="report-entry-input w-12 bg-slate-50 border border-slate-100 rounded-lg py-1.5 text-center font-black text-[11px] outline-none transition-all placeholder:font-bold placeholder:text-slate-300"
          :class="{
            'text-blue-600 border-blue-200 bg-blue-50/40': field === 'arrival' && item[field] > 0,
            'text-blue-600 border-blue-200 bg-blue-50/40': field === 'remainder' && item[field] > 0,
            'text-red-500 border-red-200 bg-red-50/40': field === 'write_off' && item[field] > 0,
            'text-slate-400': !item[field],
            'cursor-not-allowed': !editable,
          }"
        />
      </div>

      <button 
        @click="handleRemove"
        :aria-disabled="!editable"
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 active:bg-red-500 active:text-white transition-all ml-1 shrink-0"
        :class="{ 'opacity-55': !editable }"
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
