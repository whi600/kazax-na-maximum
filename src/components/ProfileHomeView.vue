<script setup>
import { computed, ref } from 'vue'
import {
  BellRing,
  CalendarClock,
  LogOut,
  Pencil,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-vue-next'
import { notificationsApi } from '../api'

defineProps({
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  canManageProducts: { type: Boolean, default: false },
  canManageSchedule: { type: Boolean, default: false },
  canManageRoles: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-assortment',
  'open-notifications',
  'open-schedule-template',
  'open-roles',
  'logout',
])

const broadcastTitle = ref('Важное уведомление')
const broadcastMessage = ref('')
const broadcastSending = ref(false)
const broadcastStatus = ref('')

const canSendBroadcast = computed(
  () =>
    broadcastTitle.value.trim().length > 0 &&
    broadcastMessage.value.trim().length > 0 &&
    !broadcastSending.value,
)

const sendBroadcast = async () => {
  if (!canSendBroadcast.value) return

  broadcastSending.value = true
  broadcastStatus.value = ''
  try {
    const response = await notificationsApi.broadcast({
      title: broadcastTitle.value,
      message: broadcastMessage.value,
    })
    const sentCount = Number(response?.sentCount || 0)
    broadcastMessage.value = ''
    broadcastStatus.value =
      sentCount > 0
        ? `Отправлено устройств: ${sentCount}`
        : 'Уведомление сохранено, но активных push-подписок не найдено'
  } catch (error) {
    broadcastStatus.value = error?.message || 'Не удалось отправить уведомление'
  } finally {
    broadcastSending.value = false
  }
}
</script>

<template>
  <section class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        <UserRound class="w-6 h-6" />
      </div>
      <div>
        <h2 class="text-lg font-black text-slate-800">{{ userName }}</h2>
        <p class="text-[10px] font-bold text-slate-400">{{ email }}</p>
      </div>
    </div>

    <div class="space-y-2 mb-5">
      <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-3">
        <span class="text-[10px] font-black text-slate-400 uppercase">Роль</span>
        <span class="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100 flex items-center gap-1">
          <ShieldCheck class="w-3 h-3" />
          {{ roleLabel }}
        </span>
      </div>
    </div>

    <div class="grid gap-2 mb-5">
      <button
        type="button"
        @click="emit('open-notifications')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <BellRing class="w-4 h-4" />
        Уведомления
      </button>

      <button
        v-if="canManageProducts"
        type="button"
        @click="emit('open-assortment')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <Pencil class="w-4 h-4" />
        Ассортимент
      </button>

      <button
        v-if="canManageSchedule"
        type="button"
        @click="emit('open-schedule-template')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <CalendarClock class="w-4 h-4" />
        Базовое расписание
      </button>

      <button
        v-if="canManageRoles"
        type="button"
        @click="emit('open-roles')"
        class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100"
      >
        <SlidersHorizontal class="w-4 h-4" />
        Роли и права
      </button>
    </div>

    <div v-if="canManageSchedule" class="mb-5 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div class="mb-3 flex items-center gap-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <BellRing class="h-4 w-4" />
        </div>
        <div>
          <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Оповещение всем
          </p>
          <p class="text-xs font-bold text-slate-500">
            Push придёт пользователям с включёнными уведомлениями
          </p>
        </div>
      </div>

      <input
        v-model="broadcastTitle"
        maxlength="80"
        type="text"
        class="mb-2 w-full rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-200"
        placeholder="Заголовок"
      />
      <textarea
        v-model="broadcastMessage"
        maxlength="240"
        rows="3"
        class="mb-2 w-full resize-none rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-200"
        placeholder="Текст уведомления"
      />
      <button
        type="button"
        :disabled="!canSendBroadcast"
        @click="sendBroadcast"
        class="w-full rounded-lg bg-slate-900 px-4 py-3 text-[11px] font-black uppercase text-white transition-all active:scale-95 disabled:opacity-40"
      >
        {{ broadcastSending ? 'Отправляем...' : 'Отправить уведомление' }}
      </button>
      <p
        v-if="broadcastStatus"
        class="mt-2 text-center text-[10px] font-black uppercase"
        :class="broadcastStatus.startsWith('Не удалось') ? 'text-red-500' : 'text-blue-600'"
      >
        {{ broadcastStatus }}
      </p>
    </div>

    <button
      type="button"
      @click="emit('logout')"
      class="w-full bg-red-500 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
    >
      <LogOut class="w-4 h-4" />
      Выйти
    </button>
  </section>
</template>
