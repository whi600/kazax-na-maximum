<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { LoaderCircle, Mic, Send, Sparkles, X } from 'lucide-vue-next'
import { assistantApi } from '../../api'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  description: {
    type: String,
    default: 'Скажите или напишите команду для текущей вкладки.',
  },
  placeholder: {
    type: String,
    default: 'Например: помоги с текущей вкладкой',
  },
  promptHint: {
    type: String,
    default: 'Нажмите и скажите команду',
  },
  disabledHint: {
    type: String,
    default: 'Сейчас изменения недоступны',
  },
  fallbackReply: {
    type: String,
    default: 'Уточните, что нужно сделать.',
  },
  commandApi: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits(['response'])

const isOpen = ref(false)
const command = ref('')
const reply = ref('')
const errorMessage = ref('')
const busy = ref(false)
const listening = ref(false)
const recording = ref(false)
const transcribing = ref(false)
let recognition = null
let recorder = null
let recorderStream = null

const voiceSupported = computed(() =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
)

const recordingSupported = computed(() =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined',
)

const voiceButtonLabel = computed(() => {
  if (transcribing.value) return 'Распознаю…'
  return recording.value || listening.value ? 'Остановить' : 'Начать запись'
})

const openAssistant = () => {
  if (props.disabled) return
  isOpen.value = true
  errorMessage.value = ''
}

const stopListening = () => {
  recognition?.stop?.()
  listening.value = false
}

const requestMicrophoneAccess = async () => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

const releaseRecorderStream = () => {
  recorderStream?.getTracks().forEach((track) => track.stop())
  recorderStream = null
}

const stopRecording = () => {
  if (recorder?.state === 'recording') recorder.stop()
}

const cancelRecording = () => {
  if (recorder?.state === 'recording') {
    recorder.ondataavailable = null
    recorder.onstop = null
    recorder.stop()
  }
  recorder = null
  recording.value = false
  listening.value = false
  releaseRecorderStream()
}

const startRecording = async () => {
  errorMessage.value = ''
  reply.value = ''

  try {
    recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks = []
    const activeRecorder = new MediaRecorder(recorderStream)
    recorder = activeRecorder

    activeRecorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data)
    }
    activeRecorder.onerror = () => {
      errorMessage.value = 'Не удалось записать голос. Попробуйте ещё раз.'
    }
    activeRecorder.onstop = async () => {
      if (recorder === activeRecorder) recorder = null
      recording.value = false
      listening.value = false
      releaseRecorderStream()

      const audio = new Blob(chunks, {
        type: activeRecorder.mimeType || chunks[0]?.type || 'audio/webm',
      })
      if (!audio.size) {
        errorMessage.value = 'Запись получилась пустой. Скажите команду ещё раз.'
        return
      }

      transcribing.value = true
      try {
        const response = await assistantApi.transcribe(audio)
        command.value = String(response?.text || '').trim()
        if (!command.value) {
          errorMessage.value = 'Не удалось распознать голос. Скажите команду ещё раз.'
        }
      } catch (error) {
        errorMessage.value = error?.message || 'Не удалось распознать голос. Попробуйте ещё раз.'
      } finally {
        transcribing.value = false
      }
    }

    activeRecorder.start(1000)
    recording.value = true
  } catch (error) {
    recorder = null
    recording.value = false
    listening.value = false
    releaseRecorderStream()
    errorMessage.value = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      ? 'Разрешите доступ к микрофону, чтобы пользоваться голосовым вводом.'
      : 'Не удалось включить микрофон. Проверьте его и попробуйте ещё раз.'
  }
}

const startVoiceInput = () => {
  if (busy.value || transcribing.value) return
  if (recording.value) {
    stopRecording()
    return
  }
  if (recordingSupported.value) {
    void startRecording()
    return
  }
  void startListening()
}

const closeAssistant = () => {
  stopListening()
  cancelRecording()
  isOpen.value = false
}

const startListening = async () => {
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
    await requestMicrophoneAccess()
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
    const response = await props.commandApi(text)
    emit('response', response)
    reply.value = response?.reply || props.fallbackReply
    command.value = ''
  } catch (error) {
    errorMessage.value = error?.code === 'AI_NOT_CONFIGURED'
      ? 'Подключите API-ключ модели в файле .env, затем перезапустите приложение.'
      : error?.message || 'Не удалось выполнить команду.'
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  stopListening()
  cancelRecording()
})
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
        <span class="block text-[11px] font-black text-slate-900">ИИ помощник</span>
        <span class="mt-0.5 block text-[10px] font-bold leading-snug text-slate-500">
          {{ disabled ? disabledHint : promptHint }}
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
          aria-label="ИИ помощник"
        >
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <Sparkles class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-black uppercase tracking-widest text-violet-600">Текущая вкладка</p>
              <h2 class="mt-0.5 text-base font-black text-slate-900">ИИ помощник</h2>
              <p class="mt-1 text-[11px] font-bold leading-relaxed text-slate-500">
                {{ description }}
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
            <label class="sr-only" for="ai-assistant-command">Команда для помощника</label>
            <textarea
              id="ai-assistant-command"
              v-model="command"
              rows="3"
              maxlength="1200"
              :disabled="busy || recording || transcribing"
              class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
              :placeholder="placeholder"
            />

            <div class="flex gap-2">
              <button
                type="button"
                :disabled="busy || transcribing"
                :aria-label="recording || listening ? 'Остановить голосовую запись' : 'Начать голосовую запись'"
                class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 text-[11px] font-black text-violet-700 transition-all active:scale-95 disabled:opacity-50"
                @click="startVoiceInput"
              >
                <Mic class="h-4 w-4" :class="{ 'animate-pulse': listening || recording || transcribing }" />
                {{ voiceButtonLabel }}
              </button>
              <button
                type="submit"
                :disabled="busy || recording || transcribing || !command.trim()"
                class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[11px] font-black text-white shadow-lg shadow-violet-100 transition-all active:scale-95 disabled:opacity-50"
              >
                <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                {{ busy ? 'Выполняю…' : 'Отправить' }}
              </button>
            </div>
            <p v-if="recording" class="text-center text-[10px] font-bold text-violet-600">
              Идёт запись. Она продолжится, пока вы не нажмёте «Остановить».
            </p>
            <p v-else-if="transcribing" class="text-center text-[10px] font-bold text-violet-600">
              Распознаю запись…
            </p>
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
