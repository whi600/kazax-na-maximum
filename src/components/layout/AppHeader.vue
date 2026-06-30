<script setup>
import { Bell, CheckCircle2, HandHelping, Plus } from 'lucide-vue-next'

defineProps({
  activeTab: { type: String, required: true },
  pageTitle: { type: String, required: true },
  userRole: { type: String, default: '' },
  canManageSchedule: { type: Boolean, default: false },
  schedulePendingCount: { type: Number, default: 0 },
  reportCanComplete: { type: Boolean, default: false },
  reportCompleted: { type: Boolean, default: false },
  reportCompleting: { type: Boolean, default: false },
})

const emit = defineEmits(['openScheduleRequests', 'openScheduleAction', 'completeReport'])
</script>

<template>
  <header class="bg-slate-50 px-4 py-3 pt-safe sticky top-0 z-40 flex items-center min-h-[68px]">
    <div class="relative flex min-h-10 w-full items-center justify-center">
      <Transition name="header-title" mode="out-in">
        <h1
          :key="pageTitle"
          class="text-xl font-black italic tracking-tighter text-slate-800 leading-none uppercase"
        >
          {{ pageTitle }}
        </h1>
      </Transition>

      <Transition name="header-actions">
        <div
          v-if="userRole && (activeTab === 'schedule' || activeTab === 'main')"
          class="absolute right-0 top-0 flex items-center gap-2"
        >
          <template v-if="activeTab === 'schedule'">
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
          </template>

          <button
            v-else-if="reportCanComplete"
            type="button"
            :disabled="reportCompleting"
            @click="emit('completeReport')"
            class="px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
            :class="
              reportCompleted
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
            "
          >
            <CheckCircle2 class="w-3.5 h-3.5" />
            {{ reportCompleting ? '...' : reportCompleted ? 'Готов' : 'Готов' }}
          </button>
        </div>
      </Transition>
    </div>
  </header>
</template>
