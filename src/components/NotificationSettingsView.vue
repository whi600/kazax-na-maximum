<script setup>
import { computed, onMounted, ref } from 'vue'
import { notificationsApi } from '../api'
import {
  getCurrentPushSubscription,
  getNotificationPermission,
  isStandalonePwa,
  requestPushPermissionAndSubscribe,
  syncPushSubscription,
  unsubscribePushSubscription,
} from '../pushNotifications'
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  Send,
  Smartphone,
} from 'lucide-vue-next'

const emit = defineEmits(['back'])

const loading = ref(true)
const saving = ref(false)
const actionBusy = ref(false)
const testBusy = ref(false)
const error = ref('')
const pushAvailable = ref(false)
const standalonePwa = ref(false)
const permission = ref(getNotificationPermission())
const subscribed = ref(false)
const settings = ref({
  push_enabled: true,
  shifts_enabled: true,
  reminders_enabled: true,
})

const statusLabel = computed(() => {
  if (!standalonePwa.value) return 'Уведомления доступны только в установленном приложении'
  if (permission.value === 'unsupported') return 'Это устройство не поддерживает push'
  if (permission.value === 'denied') return 'Уведомления запрещены в браузере'
  if (!pushAvailable.value) return 'Push недоступен на сервере'
  if (permission.value !== 'granted') return 'Нужно выдать доступ к уведомлениям'
  if (!subscribed.value) return 'Это устройство еще не подключено'
  if (!settings.value.push_enabled) return 'Уведомления отключены в приложении'
  return 'Уведомления подключены'
})

const statusClass = computed(() => {
  if (!standalonePwa.value) {
    return 'bg-slate-100 border-slate-200 text-slate-500'
  }
  if (permission.value === 'denied' || permission.value === 'unsupported') {
    return 'bg-red-50 border-red-100 text-red-600'
  }
  if (!pushAvailable.value || permission.value !== 'granted' || !subscribed.value || !settings.value.push_enabled) {
    return 'bg-amber-50 border-amber-100 text-amber-700'
  }
  return 'bg-emerald-50 border-emerald-100 text-emerald-600'
})

const categoryDisabled = computed(
  () => !pushAvailable.value || permission.value !== 'granted' || !subscribed.value || !settings.value.push_enabled,
)
const canDisconnectDevice = computed(
  () => pushAvailable.value && permission.value === 'granted' && subscribed.value,
)
const primaryActionLabel = computed(() => {
  if (permission.value === 'unsupported') return 'Устройство не поддерживается'
  if (permission.value !== 'granted') return 'Разрешить уведомления'
  if (!subscribed.value) return 'Подключить устройство'
  if (!settings.value.push_enabled) return 'Включить уведомления'
  return ''
})

const loadSettings = async () => {
  loading.value = true
  error.value = ''

  try {
    standalonePwa.value = isStandalonePwa()
    permission.value = getNotificationPermission()
    const response = await notificationsApi.settings()
    pushAvailable.value = Boolean(response.pushAvailable)
    settings.value = {
      push_enabled: Boolean(response.settings?.push_enabled),
      shifts_enabled: Boolean(response.settings?.shifts_enabled),
      reminders_enabled: Boolean(response.settings?.reminders_enabled),
    }

    if (!standalonePwa.value) {
      subscribed.value = false
    } else if (permission.value === 'granted') {
      const syncResult = await syncPushSubscription(notificationsApi).catch(() => null)
      if (syncResult) {
        subscribed.value = Boolean(syncResult.subscribed)
        permission.value = syncResult.permission || permission.value
      } else {
        subscribed.value = Boolean(await getCurrentPushSubscription())
      }
    } else {
      subscribed.value = Boolean(await getCurrentPushSubscription())
    }
  } catch (loadError) {
    error.value = loadError?.message || 'Не удалось загрузить настройки уведомлений'
  } finally {
    loading.value = false
  }
}

const saveSettings = async (patch) => {
  saving.value = true
  error.value = ''

  const previous = { ...settings.value }
  settings.value = { ...settings.value, ...patch }

  try {
    const response = await notificationsApi.updateSettings(patch)
    settings.value = {
      push_enabled: Boolean(response.settings?.push_enabled),
      shifts_enabled: Boolean(response.settings?.shifts_enabled),
      reminders_enabled: Boolean(response.settings?.reminders_enabled),
    }
  } catch (saveError) {
    settings.value = previous
    error.value = saveError?.message || 'Не удалось сохранить настройки'
  } finally {
    saving.value = false
  }
}

const enableNotifications = async () => {
  actionBusy.value = true
  error.value = ''

  try {
    if (permission.value === 'granted' && subscribed.value && !settings.value.push_enabled) {
      await saveSettings({ push_enabled: true })
      return
    }

    const result = await requestPushPermissionAndSubscribe(notificationsApi)
    permission.value = result.permission || getNotificationPermission()
    subscribed.value = Boolean(result.subscribed)

    if (permission.value === 'granted') {
      await saveSettings({ push_enabled: true })
    }
  } catch (actionError) {
    error.value = actionError?.message || 'Не удалось включить уведомления'
  } finally {
    actionBusy.value = false
  }
}

const disableOnThisDevice = async () => {
  actionBusy.value = true
  error.value = ''

  try {
    await unsubscribePushSubscription(notificationsApi)
    subscribed.value = false
    permission.value = getNotificationPermission()
  } catch (actionError) {
    error.value = actionError?.message || 'Не удалось отключить устройство'
  } finally {
    actionBusy.value = false
  }
}

const sendTestNotification = async () => {
  testBusy.value = true
  error.value = ''

  try {
    await notificationsApi.test()
  } catch (testError) {
    error.value = testError?.message || 'Не удалось отправить тест'
  } finally {
    testBusy.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <section class="space-y-3">
    <button
      type="button"
      @click="emit('back')"
      class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] font-black uppercase text-slate-500 border border-slate-100 shadow-sm active:scale-95 transition-all"
    >
      <ArrowLeft class="w-4 h-4" />
      Назад
    </button>

    <section v-if="loading" class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm">
      <p class="text-[11px] font-black uppercase text-slate-400">Загрузка настроек...</p>
    </section>

    <template v-else>
      <section class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm space-y-4">
        <div class="flex items-start gap-3">
          <div class="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <BellRing class="w-5 h-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-black text-slate-800">Уведомления</h2>
            <p class="text-[11px] font-bold text-slate-400">
              Смены и напоминания на этом устройстве
            </p>
          </div>
        </div>

        <div class="rounded-lg border px-3 py-3 text-[11px] font-black uppercase" :class="statusClass">
          {{ statusLabel }}
        </div>

        <div v-if="error" class="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-[11px] font-black text-red-600">
          {{ error }}
        </div>

        <div v-if="!standalonePwa" class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-500">
          Открой установленную PWA-версию приложения, и только там подключай push-уведомления.
        </div>

        <div class="grid gap-2">
          <button
            v-if="primaryActionLabel"
            type="button"
            @click="enableNotifications"
            :disabled="actionBusy || saving || permission === 'unsupported'"
            class="w-full bg-blue-600 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            <Smartphone class="w-4 h-4" />
            {{ primaryActionLabel }}
          </button>

          <button
            v-if="canDisconnectDevice"
            type="button"
            @click="disableOnThisDevice"
            :disabled="actionBusy || saving"
            class="w-full bg-slate-50 text-slate-600 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100 disabled:opacity-50"
          >
            <Smartphone class="w-4 h-4" />
            Отключить это устройство
          </button>

          <button
            type="button"
            @click="sendTestNotification"
            :disabled="testBusy || categoryDisabled"
            class="w-full bg-slate-50 text-slate-700 py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-100 disabled:opacity-50"
          >
            <Send class="w-4 h-4" />
            Тест уведомления
          </button>
        </div>
      </section>

      <section class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm space-y-3">
        <button
          type="button"
          @click="saveSettings({ push_enabled: !settings.push_enabled })"
          :disabled="saving || permission !== 'granted' || !subscribed || !pushAvailable"
          class="w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-all disabled:opacity-50"
          :class="settings.push_enabled ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'"
        >
          <span>
            <span class="block text-[11px] font-black uppercase text-slate-800">Все уведомления</span>
            <span class="block text-[10px] font-bold text-slate-400">Главный переключатель приложения</span>
          </span>
          <span class="text-[10px] font-black uppercase" :class="settings.push_enabled ? 'text-blue-600' : 'text-slate-400'">
            {{ settings.push_enabled ? 'Вкл' : 'Выкл' }}
          </span>
        </button>

        <button
          type="button"
          @click="saveSettings({ shifts_enabled: !settings.shifts_enabled })"
          :disabled="saving || categoryDisabled"
          class="w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-all disabled:opacity-50"
          :class="settings.shifts_enabled ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'"
        >
          <span class="flex items-center gap-3">
            <BellRing class="w-4 h-4 text-slate-500" />
            <span>
              <span class="block text-[11px] font-black uppercase text-slate-800">Смены</span>
              <span class="block text-[10px] font-bold text-slate-400">Заявки, подтверждения, изменения</span>
            </span>
          </span>
          <span class="text-[10px] font-black uppercase" :class="settings.shifts_enabled ? 'text-blue-600' : 'text-slate-400'">
            {{ settings.shifts_enabled ? 'Вкл' : 'Выкл' }}
          </span>
        </button>

        <button
          type="button"
          @click="saveSettings({ reminders_enabled: !settings.reminders_enabled })"
          :disabled="saving || categoryDisabled"
          class="w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-all disabled:opacity-50"
          :class="settings.reminders_enabled ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'"
        >
          <span class="flex items-center gap-3">
            <CalendarClock class="w-4 h-4 text-slate-500" />
            <span>
              <span class="block text-[11px] font-black uppercase text-slate-800">Напоминания</span>
              <span class="block text-[10px] font-bold text-slate-400">За 12 часов и за 2 часа до смены</span>
            </span>
          </span>
          <span class="text-[10px] font-black uppercase" :class="settings.reminders_enabled ? 'text-blue-600' : 'text-slate-400'">
            {{ settings.reminders_enabled ? 'Вкл' : 'Выкл' }}
          </span>
        </button>
      </section>
    </template>
  </section>
</template>
