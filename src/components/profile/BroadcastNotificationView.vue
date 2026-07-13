<script setup>
import { computed, ref } from 'vue'
import { ArrowLeft, BellRing, Send } from 'lucide-vue-next'
import { notificationsApi } from '../../api'

const emit = defineEmits(['back'])

const title = ref('Важное уведомление')
const message = ref('')
const sending = ref(false)
const status = ref('')

const canSend = computed(
  () => title.value.trim().length > 0 && message.value.trim().length > 0 && !sending.value,
)

const sendBroadcast = async () => {
  if (!canSend.value) return

  sending.value = true
  status.value = ''

  try {
    const response = await notificationsApi.broadcast({
      title: title.value,
      message: message.value,
    })
    const sentCount = Number(response?.sentCount || 0)
    message.value = ''
    status.value =
      sentCount > 0
        ? `Отправлено устройств: ${sentCount}`
        : 'Активных push-подписок не найдено'
  } catch (error) {
    status.value = error?.message || 'Не удалось отправить уведомление'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] font-black uppercase text-slate-500 shadow-sm transition-all active:scale-95"
      @click="emit('back')"
    >
      <ArrowLeft class="h-4 w-4" />
      Назад
    </button>

    <header class="px-1">
      <div class="flex items-center gap-2">
        <BellRing class="h-5 w-5 text-blue-600" />
        <h2 class="text-lg font-black text-slate-800">Оповещение всем</h2>
      </div>
      <p class="mt-1 text-[11px] font-bold text-slate-400">
        Push получат пользователи с включенными уведомлениями.
      </p>
    </header>

    <div class="space-y-3">
      <label class="block">
        <span class="mb-1.5 flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
          Заголовок
          <span>{{ title.length }}/80</span>
        </span>
        <input
          v-model="title"
          maxlength="80"
          type="text"
          class="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-400"
          placeholder="Заголовок"
        />
      </label>

      <label class="block">
        <span class="mb-1.5 flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
          Текст
          <span>{{ message.length }}/240</span>
        </span>
        <textarea
          v-model="message"
          maxlength="240"
          rows="5"
          class="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-400"
          placeholder="Текст уведомления"
        />
      </label>

      <button
        type="button"
        :disabled="!canSend"
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-[11px] font-black uppercase text-white transition-all active:scale-[0.99] disabled:opacity-40"
        @click="sendBroadcast"
      >
        <Send class="h-4 w-4" />
        {{ sending ? 'Отправляем...' : 'Отправить уведомление' }}
      </button>

      <p
        v-if="status"
        class="rounded-xl border px-3 py-3 text-center text-[10px] font-black uppercase"
        :class="status.startsWith('Не удалось') ? 'border-red-100 bg-red-50 text-red-500' : 'border-blue-100 bg-blue-50 text-blue-600'"
      >
        {{ status }}
      </p>
    </div>
  </section>
</template>
