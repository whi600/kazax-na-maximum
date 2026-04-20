<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Bell, HandHelping, Plus, X } from 'lucide-vue-next'

const props = defineProps({
  activeTab: { type: String, required: true },
  pageTitle: { type: String, required: true },
  userRole: { type: String, default: '' },
  canManageSchedule: { type: Boolean, default: false },
  schedulePendingCount: { type: Number, default: 0 },
  messengerSearchOpen: { type: Boolean, default: false },
  messengerSearchQuery: { type: String, default: '' },
})

const emit = defineEmits([
  'update:messengerSearchQuery',
  'openMessengerSearch',
  'closeMessengerSearch',
  'openGroupSheet',
  'openScheduleRequests',
  'openScheduleAction',
])

const messengerSearchInput = ref(null)
let blurTimer = null
let openedAt = 0

const focusMessengerSearch = async () => {
  await nextTick()
  messengerSearchInput.value?.focus?.({ preventScroll: true })
  setTimeout(() => {
    if (props.messengerSearchOpen) {
      messengerSearchInput.value?.focus?.({ preventScroll: true })
    }
  }, 80)
}

watch(
  () => props.messengerSearchOpen,
  (isOpen) => {
    if (blurTimer) {
      clearTimeout(blurTimer)
      blurTimer = null
    }

    if (isOpen) {
      openedAt = Date.now()
      focusMessengerSearch()
    }
  },
)

const onMessengerSearchBlur = () => {
  if (blurTimer) clearTimeout(blurTimer)

  blurTimer = setTimeout(() => {
    blurTimer = null
    if (!props.messengerSearchOpen) return

    if (Date.now() - openedAt < 450) {
      messengerSearchInput.value?.focus?.({ preventScroll: true })
      return
    }

    emit('closeMessengerSearch')
  }, 120)
}

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer)
})
</script>

<template>
  <header class="bg-slate-50 px-4 py-3 pt-safe sticky top-0 z-40 flex items-center min-h-[68px]">
    <div class="relative flex min-h-10 w-full items-center justify-center">
      <Transition name="header-title" mode="out-in">
        <h1
          :key="activeTab === 'messenger' ? 'messenger' : pageTitle"
          class="text-xl font-black italic tracking-tighter text-slate-800 leading-none uppercase"
        >
          {{ activeTab === 'messenger' ? 'Чаты' : pageTitle }}
        </h1>
      </Transition>

      <Transition name="messenger-search">
        <div
          v-if="activeTab === 'messenger' && messengerSearchOpen"
          class="absolute inset-x-0 top-0 flex h-10 origin-right items-center gap-2 overflow-hidden rounded-[18px] border border-slate-100 bg-white px-3 shadow-sm"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true">
            <circle cx="10.25" cy="10.25" r="4.75" fill="currentColor" />
            <rect
              x="13.85"
              y="13.35"
              width="6.7"
              height="1.8"
              rx="0.9"
              transform="rotate(45 13.85 13.35)"
              fill="currentColor"
            />
          </svg>
          <input
            ref="messengerSearchInput"
            :value="messengerSearchQuery"
            type="text"
            placeholder="Найти человека"
            autofocus
            class="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-slate-800 placeholder:text-slate-300"
            @input="emit('update:messengerSearchQuery', $event.target.value)"
            @blur="onMessengerSearchBlur"
          />
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 active:scale-95"
            aria-label="Закрыть поиск"
            @click="emit('closeMessengerSearch')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </Transition>

      <Transition name="messenger-actions">
        <div
          v-if="activeTab === 'messenger' && !messengerSearchOpen"
          class="absolute right-0 top-0 flex items-center overflow-hidden rounded-[18px] bg-slate-900 p-1 shadow-sm"
        >
          <button
            type="button"
            @click="emit('openMessengerSearch')"
            class="flex h-8 w-8 items-center justify-center rounded-[14px] text-white/90 transition-all active:scale-95"
            aria-label="Показать людей"
          >
            <svg viewBox="0 0 24 24" class="h-6 w-6" aria-hidden="true">
              <path
                d="M10.5 5.5a5 5 0 1 0 3.18 8.86l3.82 3.82a1 1 0 0 0 1.42-1.42l-3.82-3.82A5 5 0 0 0 10.5 5.5Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <button
            type="button"
            @click="emit('openGroupSheet')"
            class="flex h-8 w-8 items-center justify-center rounded-[14px] text-white/90 transition-all active:scale-95"
            aria-label="Создать группу"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
              <path
                d="M9 11.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Zm6.75-1.1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                fill="currentColor"
              />
              <path
                d="M4.5 19.15c0-2.45 2.25-4.45 5.5-4.45s5.5 2 5.5 4.45c0 .9-.73 1.65-1.63 1.65H6.13c-.9 0-1.63-.75-1.63-1.65Z"
                fill="currentColor"
              />
              <path
                d="M17.75 13a.9.9 0 0 1 .9.9v1.4h1.4a.9.9 0 1 1 0 1.8h-1.4v1.4a.9.9 0 1 1-1.8 0v-1.4h-1.4a.9.9 0 1 1 0-1.8h1.4v-1.4a.9.9 0 0 1 .9-.9Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </Transition>

      <Transition name="header-actions">
        <div
          v-if="activeTab === 'schedule' && userRole"
          class="absolute right-0 top-0 flex items-center gap-2"
        >
          <button
            v-if="canManageSchedule && schedulePendingCount > 0"
            @click="emit('openScheduleRequests')"
            class="relative bg-white text-blue-600 border border-blue-100 px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Bell class="w-3.5 h-3.5 animate-swing" />
            Заявки
            <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center border-2 border-white">
              {{ schedulePendingCount }}
            </span>
          </button>

          <button
            @click="emit('openScheduleAction')"
            class="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg shadow-blue-200 active:scale-95 transition-all"
          >
            <Plus v-if="canManageSchedule" class="w-3.5 h-3.5" />
            <HandHelping v-else class="w-3.5 h-3.5" />
            {{ canManageSchedule ? 'Смена' : 'Помочь' }}
          </button>
        </div>
      </Transition>
    </div>
  </header>
</template>
