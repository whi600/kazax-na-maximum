<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Ellipsis, Pencil, Trash2 } from 'lucide-vue-next'

const emit = defineEmits(['edit', 'delete'])

const root = ref(null)
const isOpen = ref(false)

const close = () => {
  isOpen.value = false
}

const selectAction = (action) => {
  close()
  emit(action)
}

const handleOutsidePointer = (event) => {
  if (!root.value?.contains(event.target)) close()
}

const handleKeydown = (event) => {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-600 active:bg-slate-100"
      aria-label="Действия со сменой"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      @click.stop="isOpen = !isOpen"
    >
      <Ellipsis class="h-4 w-4" />
    </button>

    <Transition name="shift-actions">
      <div
        v-if="isOpen"
        class="absolute right-0 top-full z-30 mt-1 min-w-36 overflow-hidden rounded-lg border border-slate-100 bg-white py-1 shadow-lg"
        role="menu"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-black uppercase text-slate-600 transition-colors hover:bg-slate-50"
          role="menuitem"
          @click="selectAction('edit')"
        >
          <Pencil class="h-3.5 w-3.5 text-blue-600" />
          Изменить
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-black uppercase text-red-500 transition-colors hover:bg-red-50"
          role="menuitem"
          @click="selectAction('delete')"
        >
          <Trash2 class="h-3.5 w-3.5" />
          Удалить
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.shift-actions-enter-active,
.shift-actions-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.shift-actions-enter-from,
.shift-actions-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
