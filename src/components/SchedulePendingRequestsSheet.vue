<script setup>
import { Bell, Check, X } from 'lucide-vue-next'

defineProps({
  requests: { type: Array, default: () => [] },
  formatDateHeader: { type: Function, required: true },
})

const emit = defineEmits(['close', 'reject', 'approve'])
</script>

<template>
  <div
    class="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm pt-safe"
    @click.self="emit('close')"
  >
    <div class="sheet-safe sheet-max flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white p-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
      <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-black uppercase italic tracking-tighter">
            Заявки
          </h3>
          <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {{ requests.length }} на подтверждение
          </p>
        </div>
        <button @click="emit('close')" class="rounded-full bg-slate-50 p-2 text-slate-300">
          <X class="h-5 w-5" />
        </button>
      </div>

      <div v-if="requests.length === 0" class="py-12 text-center opacity-30">
        <Bell class="mx-auto mb-3 h-10 w-10" />
        <p class="text-xs font-black uppercase">Заявок нет</p>
      </div>

      <div v-else class="space-y-2 overflow-y-auto pb-2">
        <div
          v-for="request in requests"
          :key="request.id"
          class="rounded-2xl border border-slate-100 bg-slate-50 p-3"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {{ formatDateHeader(request.date) }}
              </p>
              <p class="mt-1 text-base font-black text-slate-800">
                {{ request.start_time }}-{{ request.end_time }}
              </p>
            </div>
            <span class="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-600">
              Помочь
            </span>
          </div>

          <p class="mb-3 text-[11px] font-black uppercase text-blue-600">
            {{ request.employee_name }}
          </p>

          <div class="grid grid-cols-2 gap-2">
            <button
              @click="emit('reject', request.id)"
              class="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 py-3 text-[10px] font-black uppercase text-red-500 transition-all active:scale-95"
            >
              <X class="h-4 w-4" />
              Отклонить
            </button>
            <button
              @click="emit('approve', request)"
              class="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-3 text-[10px] font-black uppercase text-white transition-all active:scale-95"
            >
              <Check class="h-4 w-4" />
              Подтвердить
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
