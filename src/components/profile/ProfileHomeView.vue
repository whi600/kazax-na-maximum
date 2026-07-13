<script setup>
import { computed } from 'vue'
import {
  BellRing,
  CalendarClock,
  LogOut,
  Megaphone,
  Package,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  UserRound,
} from 'lucide-vue-next'
import ProfileMenuItem from './ProfileMenuItem.vue'

const props = defineProps({
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  canManageProducts: { type: Boolean, default: false },
  canManageSchedule: { type: Boolean, default: false },
  canManageRoles: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-assortment',
  'open-notifications',
  'open-schedule-template',
  'open-employees',
  'open-roles',
  'open-audit',
  'open-broadcast',
  'logout',
])

const hasWorkspaceTools = computed(
  () => props.canManageProducts || props.canManageSchedule,
)
const hasAdministrationTools = computed(
  () => props.canManageRoles || props.isSuperAdmin,
)
</script>

<template>
  <section class="space-y-6 pb-2 page-stack">
    <header class="flex items-center gap-3 px-2 pt-2">
      <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
        <UserRound class="h-7 w-7" />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-lg font-black text-slate-800">{{ userName }}</h2>
        <p class="mt-0.5 truncate text-[11px] font-bold text-slate-400">{{ email }}</p>
        <span
          v-if="roleLabel"
          class="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-600"
        >
          <ShieldCheck class="h-3 w-3" />
          {{ roleLabel }}
        </span>
      </div>
    </header>

    <section class="space-y-2">
      <p class="px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Аккаунт</p>
      <ProfileMenuItem
        :icon="BellRing"
        title="Уведомления"
        description="Настройка на этом устройстве"
        @select="emit('open-notifications')"
      />
    </section>

    <section v-if="hasWorkspaceTools" class="space-y-2">
      <p class="px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Рабочее пространство</p>
      <ProfileMenuItem
        v-if="canManageSchedule"
        :icon="UsersRound"
        title="Сотрудники"
        description="Профили и история смен"
        @select="emit('open-employees')"
      />
      <ProfileMenuItem
        v-if="canManageProducts"
        :icon="Package"
        title="Ассортимент"
        description="Товары и категории"
        @select="emit('open-assortment')"
      />
      <ProfileMenuItem
        v-if="canManageSchedule"
        :icon="CalendarClock"
        title="Базовое расписание"
        description="Смены для новых недель"
        @select="emit('open-schedule-template')"
      />
      <ProfileMenuItem
        v-if="canManageSchedule"
        :icon="Megaphone"
        title="Оповещение всем"
        description="Отправить push сотрудникам"
        @select="emit('open-broadcast')"
      />
    </section>

    <section v-if="hasAdministrationTools" class="space-y-2">
      <p class="px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Администрирование</p>
      <ProfileMenuItem
        v-if="canManageRoles"
        :icon="SlidersHorizontal"
        title="Роли и доступ"
        description="Права сотрудников"
        @select="emit('open-roles')"
      />
      <ProfileMenuItem
        v-if="isSuperAdmin"
        :icon="ScrollText"
        title="Журнал изменений"
        description="Действия в системе"
        badge="Супер-админ"
        @select="emit('open-audit')"
      />
    </section>

    <button
      type="button"
      class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3.5 text-[11px] font-black uppercase text-white shadow-sm shadow-red-100 transition-all active:scale-[0.99]"
      @click="emit('logout')"
    >
      <LogOut class="h-4 w-4" />
      Выйти
    </button>
  </section>
</template>
