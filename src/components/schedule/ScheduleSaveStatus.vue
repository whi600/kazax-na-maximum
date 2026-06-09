<script setup>
defineProps({
  label: { type: String, default: '' },
  statusClass: { type: String, default: '' },
})
</script>

<template>
  <div
    v-if="label"
    class="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
    :style="{ bottom: 'calc(86px + var(--app-safe-bottom, env(safe-area-inset-bottom)))' }"
  >
    <div
      class="rounded-full border px-4 py-2 text-[11px] font-black uppercase shadow-sm backdrop-blur-sm"
      :class="statusClass"
    >
      {{ label }}
    </div>
  </div>
</template>
