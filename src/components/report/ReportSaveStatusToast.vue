<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  status: { type: String, default: 'idle' },
  label: { type: String, default: '' },
  statusClass: { type: String, default: '' },
})

defineEmits(['retry'])

const retryable = computed(() => ['pending', 'error'].includes(props.status))
</script>

<template>
  <div
    v-if="show"
    class="fixed left-1/2 z-[120] -translate-x-1/2"
    :class="retryable ? 'pointer-events-auto' : 'pointer-events-none'"
    :style="{ bottom: 'calc(86px + var(--app-safe-bottom))' }"
  >
    <div
      class="flex items-center gap-3 rounded-full border px-4 py-2 text-[11px] font-black uppercase shadow-sm backdrop-blur-sm"
      :class="statusClass"
    >
      <span>{{ label }}</span>
      <button
        v-if="retryable"
        type="button"
        class="rounded-full bg-red-500 px-3 py-1 text-[10px] font-black uppercase text-white transition-all active:scale-95"
        @click="$emit('retry')"
      >
        Повторить
      </button>
    </div>
  </div>
</template>
