<script setup>
defineProps({
  open: { type: Boolean, default: false },
  firstTime: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

defineEmits(['close', 'confirm'])
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
          <p class="text-[10px] font-black uppercase tracking-widest text-blue-600">
            Подтверждение отчета
          </p>
          <h2 class="mt-1 text-lg font-black text-slate-900">
            {{ completed ? 'Отчет уже готов' : 'Отметить отчет готовым?' }}
          </h2>
          <p class="mt-2 text-sm font-bold leading-relaxed text-slate-500">
            <template v-if="firstTime && !completed">
              После подтверждения отчет считается закрытым. Если потом нужно будет
              изменить отчет или снять статус готовности, это сможет сделать только админ.
            </template>
            <template v-else-if="completed">
              Статус уже установлен. Если данные нужно изменить, обратитесь к админу.
            </template>
            <template v-else>
              Подтвердите, что отчет заполнен и его можно закрыть.
            </template>
          </p>

          <div class="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-black uppercase text-slate-500 transition-all active:scale-95 disabled:opacity-50"
              @click="$emit('close')"
            >
              Закрыть
            </button>
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg bg-blue-600 px-3 py-3 text-[11px] font-black uppercase text-white shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
              @click="$emit('confirm')"
            >
              {{ busy ? 'Сохраняем...' : completed ? 'Понятно' : 'Подтвердить' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
