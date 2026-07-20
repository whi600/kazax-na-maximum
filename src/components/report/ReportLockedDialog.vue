<script setup>
import { LockKeyhole } from 'lucide-vue-next'

defineProps({
  open: { type: Boolean, default: false },
})

defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm"
        @click.self="$emit('close')"
      >
        <section class="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <LockKeyhole class="h-5 w-5" />
          </span>
          <h2 class="mt-3 text-lg font-black text-slate-900">Отчёт уже готов</h2>
          <p class="mt-2 text-sm font-bold leading-relaxed text-slate-500">
            После фиксации изменить отчёт может только администратор или супер-админ.
            Обратитесь к администратору, чтобы он внёс правки и снял статус «Готов».
          </p>
          <button
            type="button"
            class="mt-4 w-full rounded-lg bg-slate-900 px-3 py-3 text-[11px] font-black uppercase text-white transition-all active:scale-[0.99]"
            @click="$emit('close')"
          >
            Понятно
          </button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
