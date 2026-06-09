<script setup>
import { X } from 'lucide-vue-next'

defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  submitLabel: { type: String, required: true },
  formattedDate: { type: String, required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
})

const emit = defineEmits([
  'close',
  'submit',
  'update:date',
  'update:startTime',
  'update:endTime',
])

</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[130] bg-slate-50/98 backdrop-blur-sm">
      <div class="flex h-full min-h-[100dvh] flex-col">
        <div class="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/95 px-4 pb-3 pt-safe">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {{ eyebrow }}
            </p>
            <h3 class="truncate text-xl font-black uppercase italic tracking-tighter text-slate-900">
              {{ title }}
            </h3>
          </div>
          <button @click="emit('close')" class="rounded-full bg-white p-2 text-slate-400 shadow-sm">
            <X class="h-6 w-6" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-5">
          <div class="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
            <div class="rounded-[30px] border border-slate-100 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <p class="mb-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Заполните детали
              </p>

              <div class="space-y-4">
                <label class="block rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <span class="mb-2 block text-[10px] font-black uppercase text-slate-400">Выберите дату</span>
                  <input
                    type="date"
                    :value="date"
                    :min="new Date().toISOString().slice(0, 10)"
                    class="block w-full rounded-xl border border-slate-100 bg-white px-3 py-3 text-base font-bold text-slate-900 outline-none focus:border-blue-300"
                    @input="emit('update:date', $event.target.value)"
                    @change="emit('update:date', $event.target.value)"
                  />
                  <span class="mt-2 block text-[11px] font-bold text-slate-400">{{ formattedDate }}</span>
                </label>

                <div class="grid grid-cols-2 gap-4">
                  <div
                    class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                  >
                    <label class="mb-2 block text-center text-[10px] font-black uppercase text-slate-400">Начало</label>
                    <input
                      type="time"
                      :value="startTime"
                      class="w-full cursor-pointer bg-transparent p-0 text-center text-base font-bold text-slate-900 outline-none"
                      @input="emit('update:startTime', $event.target.value)"
                    />
                  </div>
                  <div
                    class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                  >
                    <label class="mb-2 block text-center text-[10px] font-black uppercase text-slate-400">Конец</label>
                    <input
                      type="time"
                      :value="endTime"
                      class="w-full cursor-pointer bg-transparent p-0 text-center text-base font-bold text-slate-900 outline-none"
                      @input="emit('update:endTime', $event.target.value)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="h-6 shrink-0" />
          </div>
        </div>

        <div class="border-t border-slate-100 bg-white px-4 pb-[calc(1rem+var(--app-safe-bottom,env(safe-area-inset-bottom)))] pt-3">
          <div class="mx-auto flex w-full max-w-md gap-3">
            <div class="flex-1">
              <button
                type="button"
                @click="emit('close')"
                class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-[11px] font-black uppercase text-slate-500 transition-colors active:bg-slate-100"
              >
                Отмена
              </button>
            </div>
            <button
              @click="emit('submit')"
              class="flex-[1.35] rounded-2xl bg-blue-600 px-4 py-4 text-[11px] font-black uppercase text-white shadow-xl shadow-blue-200 transition-all active:scale-[0.99]"
            >
              {{ submitLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
