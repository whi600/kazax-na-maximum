<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  weekRange: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 px-4"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-2xl">
          <p class="text-[10px] font-black uppercase tracking-widest text-red-500">
            Удаление недели
          </p>
          <h3 class="mt-2 text-xl font-black text-slate-900">
            {{ weekRange }}
          </h3>
          <p class="mt-2 text-sm font-bold leading-snug text-slate-500">
            Неделя удалится полностью. Если на сменах есть сотрудники, сервер не даст удалить её.
          </p>
          <div class="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm font-black text-slate-500"
              :disabled="busy"
              @click="emit('close')"
            >
              Отмена
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              :disabled="busy"
              @click="emit('confirm')"
            >
              {{ busy ? 'Удаляем...' : 'Удалить' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
