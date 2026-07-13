<script setup>
import { reactive, watch } from 'vue'
import { reportFieldLabels } from '../../../report/reportEntries'

const props = defineProps({
  conflict: { type: Object, default: null },
})

const emit = defineEmits(['resolve', 'discard'])
const choices = reactive({})

watch(
  () => props.conflict,
  (conflict) => {
    Object.keys(choices).forEach((key) => delete choices[key])
    conflict?.conflicts?.forEach((item) => {
      choices[item.key] = 'local'
    })
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="conflict"
        class="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      >
        <section class="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
          <header class="border-b border-slate-100 px-5 py-4">
            <p class="text-[10px] font-black uppercase text-amber-600">Конфликт сохранения</p>
            <h2 class="mt-1 text-lg font-black text-slate-900">Выберите правильные значения</h2>
            <p class="mt-1 text-sm font-semibold leading-snug text-slate-500">
              Отчет за {{ conflict.operation.recordDate }} изменили на другом устройстве.
              По умолчанию оставлены ваши значения.
            </p>
          </header>

          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 overscroll-contain">
            <article
              v-for="item in conflict.conflicts"
              :key="item.key"
              class="rounded-lg border border-slate-200 p-3"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <strong class="min-w-0 truncate text-sm text-slate-900">{{ item.productName }}</strong>
                <span class="shrink-0 text-[10px] font-black uppercase text-slate-400">
                  {{ reportFieldLabels[item.field] }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-lg border px-3 py-2 text-left transition-colors"
                  :class="choices[item.key] === 'local'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600'"
                  @click="choices[item.key] = 'local'"
                >
                  <span class="block text-[9px] font-black uppercase opacity-70">На устройстве</span>
                  <span class="block text-base font-black">{{ item.localValue }}</span>
                </button>
                <button
                  type="button"
                  class="rounded-lg border px-3 py-2 text-left transition-colors"
                  :class="choices[item.key] === 'server'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600'"
                  @click="choices[item.key] = 'server'"
                >
                  <span class="block text-[9px] font-black uppercase opacity-70">На сервере</span>
                  <span class="block text-base font-black">{{ item.serverValue }}</span>
                </button>
              </div>
            </article>
          </div>

          <footer class="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
            <button
              type="button"
              class="rounded-lg border border-slate-200 px-3 py-3 text-[11px] font-black uppercase text-slate-500"
              @click="emit('discard')"
            >
              Взять с сервера
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-3 py-3 text-[11px] font-black uppercase text-white"
              @click="emit('resolve', { ...choices })"
            >
              Сохранить выбор
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
