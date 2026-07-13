<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  enabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  label: { type: String, default: 'Показать еще' },
})

const emit = defineEmits(['load'])

const trigger = ref(null)
let observer = null
let requested = false

const disconnectObserver = () => {
  observer?.disconnect()
  observer = null
}

const requestLoad = () => {
  if (!props.enabled || props.loading || requested) return
  requested = true
  emit('load')
}

const connectObserver = async () => {
  disconnectObserver()
  if (
    !props.enabled ||
    props.loading ||
    typeof window === 'undefined' ||
    !('IntersectionObserver' in window)
  ) {
    return
  }

  await nextTick()
  if (!trigger.value) return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) requestLoad()
    },
    { root: null, rootMargin: '160px 0px', threshold: 0.1 },
  )

  observer.observe(trigger.value)
}

watch(
  () => [props.enabled, props.loading],
  ([enabled, loading]) => {
    if (!loading) requested = false
    if (enabled) connectObserver()
    else disconnectObserver()
  },
)

onMounted(connectObserver)
onBeforeUnmount(disconnectObserver)
</script>

<template>
  <button
    v-if="enabled"
    ref="trigger"
    type="button"
    :disabled="loading"
    class="w-full py-3 text-center text-[10px] font-black uppercase tracking-wide text-slate-400 transition-colors active:text-blue-600 disabled:cursor-wait"
    @click="requestLoad"
  >
    {{ loading ? 'Загружаем...' : label }}
  </button>
</template>
