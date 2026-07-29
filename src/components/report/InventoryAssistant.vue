<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { LoaderCircle, Mic, Send, Sparkles, X } from 'lucide-vue-next'
import { assistantApi } from '../../api'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['actions'])

const isOpen = ref(false)
const command = ref('')
const reply = ref('')
const errorMessage = ref('')
const busy = ref(false)
const listening = ref(false)
let recognition = null

const voiceSupported = computed(() =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
)

const openAssistant = () => {
  if (props.disabled) return
  isOpen.value = true
  errorMessage.value = ''
}

const stopListening = () => {
  recognition?.stop?.()
  listening.value = false
}

const closeAssistant = () => {
  stopListening()
  isOpen.value = false
}

const startListening = () => {
  errorMessage.value = ''
  if (!voiceSupported.value) {
    errorMessage.value = 'Голосовой ввод не поддерживается в этом браузере. Напишите команду текстом.'
    return
  }
  if (listening.value) {
    stopListening()
    return
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SpeechRecognition()
  recognition.lang = 'ru-RU'
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    command.value = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join('')
      .trim()
  }
  recognition.onerror = (event) => {
    errorMessage.value = event.error === 'not-allowed'
      ? 'Разрешите доступ к микрофону, чтобы пользоваться голосовым вводом.'
      : 'Не удалось распознать голос. Попробуйте ещё раз или напишите команду.'
  }
  recognition.onend = () => {
    listening.value = false
  }

  try {
    recognition.start()
    listening.value = true
  } catch {
    errorMessage.value = 'Не удалось включить микрофон. Попробуйте ещё раз.'
  }
}

const sendCommand = async () => {
  const text = command.value.trim()
  if (!text || busy.value || props.disabled) return

  busy.value = true
  errorMessage.value = ''
  reply.value = ''
  try {
    const response = await assistantApi.command(text)
    const actions = Array.isArray(response.actions) ? response.actions : []
    if (actions.length) emit('actions', actions)
    reply.value = response.reply || (
      actions.length
        ? 'Изменения добавлены в отчёт и сохраняются.'
        : 'Уточните товар и количество остатка.'
    )
    command.value = ''
  } catch (error) {
    errorMessage.value = error?.code === 'AI_NOT_CONFIGURED'
      ? 'Подключите API-ключ модели в файле .env, затем перезапустите приложение.'
      : error?.message || 'Не удалось выполнить команду.'
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(stopListening)
</script>

<template>
  <div class="rounded-xl border border-violet-100 bg-violet-50/60 p-2 shadow-sm">
    <button
      type="button"
      :disabled="disabled"
      class="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-2.5 text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
      @click="openAssistant"
    >
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
        <Sparkles class="h-4 w-4" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[11px] font-black text-slate-900">ИИ-помощник по остаткам</span>
        <span class="mt-0.5 block text-[10px] font-bold leading-snug text-slate-500">
          {{ disabled ? 'Отчёт закрыт для изменений' : 'Нажмите и скажите: «Остаток молока — 7»' }}
        </span>
      </span>
      <Mic class="h-4 w-4 shrink-0 text-violet-500" />
    </button>
  </div>

  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[185] flex items-end bg-slate-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4"
        @click.self="closeAssistant"
      >
        <section
          class="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="ИИ-помощник по остаткам"
        >
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <Sparkles class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-black uppercase tracking-widest text-violet-600">Остатки</p>
              <h2 class="mt-0.5 text-base font-black text-slate-900">Голосовой помощник</h2>
              <p class="mt-1 text-[11px] font-bold leading-relaxed text-slate-500">
                Скажите или напишите, какой остаток нужно указать. Например: «Остаток круассана — 12».
              </p>
            </div>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition-colors hover:text-slate-700"
              aria-label="Закрыть помощника"
              @click="closeAssistant"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <form class="mt-4 space-y-2" @submit.prevent="sendCommand">
            <label class="sr-only" for="assistant-command">Команда для помощника</label>
            <textarea
              id="assistant-command"
              v-model="command"
              rows="3"
              maxlength="1200"
              :disabled="busy"
              class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
              placeholder="Например: поставь остаток молока 7"
            />

            <div class="flex gap-2">
              <button
                type="button"
                :disabled="busy"
                class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 text-[11px] font-black text-violet-700 transition-all active:scale-95 disabled:opacity-50"
                @click="startListening"
              >
                <Mic class="h-4 w-4" :class="{ 'animate-pulse': listening }" />
                {{ listening ? 'Слушаю…' : 'Сказать' }}
              </button>
              <button
                type="submit"
                :disabled="busy || !command.trim()"
                class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[11px] font-black text-white shadow-lg shadow-violet-100 transition-all active:scale-95 disabled:opacity-50"
              >
                <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                {{ busy ? 'Выполняю…' : 'Отправить' }}
              </button>
            </div>
          </form>

          <p v-if="reply" class="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-emerald-800" aria-live="polite">
            {{ reply }}
          </p>
          <p v-if="errorMessage" class="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-red-700" role="alert">
            {{ errorMessage }}
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
