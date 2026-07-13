<script setup>
defineProps({
  conflict: { type: Object, default: null },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['reload', 'force'])
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="conflict"
        class="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
      >
        <section class="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
          <p class="text-[10px] font-black uppercase text-amber-600">Есть более новая версия</p>
          <h2 class="mt-1 text-lg font-black text-slate-900">{{ conflict.title }}</h2>
          <p class="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
            {{ conflict.message }}
          </p>
          <div class="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg border border-slate-200 px-3 py-3 text-[11px] font-black uppercase text-slate-500 disabled:opacity-50"
              @click="emit('reload')"
            >
              Загрузить новую
            </button>
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg bg-blue-600 px-3 py-3 text-[11px] font-black uppercase text-white disabled:opacity-50"
              @click="emit('force')"
            >
              Оставить мою
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
