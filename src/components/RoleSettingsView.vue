<script setup>
import { ArrowLeft, Check, Save } from 'lucide-vue-next'

const props = defineProps({
  rolePermissions: { type: Array, default: () => [] },
  permissionRows: { type: Array, default: () => [] },
  roleUsers: { type: Array, default: () => [] },
  roleLabels: { type: Object, default: () => ({}) },
  roleSettingsBusy: { type: Boolean, default: false },
  roleUsersLoading: { type: Boolean, default: false },
  roleUserUpdatingId: { type: [Number, null], default: null },
  currentUserId: { type: [Number, null], default: null },
  isSuperAdmin: { type: Boolean, default: false },
  superAdminEmail: { type: String, required: true },
})

const emit = defineEmits([
  'back',
  'toggle-permission',
  'save-permissions',
  'refresh-users',
  'update-user-role',
  'change-user-role',
])

const editableRoleRows = (roles) =>
  roles.filter((row) => row.role === 'chef' || row.role === 'employee')

const canEditUserRole = (targetUser) => {
  if (targetUser.isSuperAdmin) return props.isSuperAdmin
  if (props.isSuperAdmin) return true
  if (targetUser.id === props.currentUserId) return false
  return targetUser.role !== 'admin'
}
</script>

<template>
  <section class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm space-y-3">
    <button
      type="button"
      @click="emit('back')"
      class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      Назад в профиль
    </button>

    <div
      v-if="roleSettingsBusy && rolePermissions.length === 0"
      class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500"
    >
      Загрузка настроек...
    </div>

    <div
      v-for="roleItem in editableRoleRows(rolePermissions)"
      :key="roleItem.role"
      class="rounded-lg border border-slate-100 p-3 space-y-2"
    >
      <h3 class="text-[11px] font-black uppercase text-slate-800">
        {{ roleLabels[roleItem.role] || roleItem.role }}
      </h3>
      <button
        v-for="perm in permissionRows"
        :key="`${roleItem.role}-${perm.key}`"
        type="button"
        @click="emit('toggle-permission', roleItem.role, perm.key)"
        class="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition-all"
        :class="
          roleItem.permissions?.[perm.key]
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-slate-50 text-slate-500 border-slate-100'
        "
      >
        <span>{{ perm.label }}</span>
        <span
          class="inline-flex w-4 h-4 rounded border items-center justify-center"
          :class="roleItem.permissions?.[perm.key] ? 'border-white/70' : 'border-slate-300'"
        >
          <Check v-if="roleItem.permissions?.[perm.key]" class="w-3 h-3" />
        </span>
      </button>
    </div>

    <button
      type="button"
      @click="emit('save-permissions')"
      :disabled="roleSettingsBusy"
      class="w-full bg-blue-600 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <Save class="w-4 h-4" />
      Сохранить права
    </button>

    <div class="rounded-lg border border-slate-100 p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-[11px] font-black uppercase text-slate-800">Пользователи и роли</h3>
        <button
          type="button"
          @click="emit('refresh-users')"
          class="text-[10px] font-black uppercase text-blue-600"
        >
          Обновить
        </button>
      </div>

      <p class="text-[9px] font-black uppercase text-slate-400">
        Супер-админ: {{ superAdminEmail }}
      </p>

      <div
        v-if="roleUsersLoading && roleUsers.length === 0"
        class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500"
      >
        Загрузка пользователей...
      </div>

      <div class="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
        <div
          v-for="user in roleUsers"
          :key="user.id"
          class="rounded-lg border border-slate-100 p-2.5 bg-white"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-black text-slate-800 truncate">{{ user.name }}</p>
              <p class="text-[9px] font-black text-slate-400 truncate">{{ user.email }}</p>
            </div>
            <span
              v-if="user.isSuperAdmin"
              class="shrink-0 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-1.5 py-1 text-[8px] font-black uppercase"
            >
              Супер-админ
            </span>
          </div>

          <div class="mt-2 flex items-center gap-2">
            <select
              :value="user.role"
              :disabled="!canEditUserRole(user) || roleUserUpdatingId === user.id"
              class="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[10px] font-black text-slate-700 uppercase disabled:opacity-60"
              @change="emit('update-user-role', user, $event.target.value)"
            >
              <option value="employee">Сотрудник</option>
              <option value="chef">Шеф</option>
              <option value="admin">Админ</option>
            </select>
            <button
              type="button"
              @click="emit('change-user-role', user)"
              :disabled="!canEditUserRole(user) || roleUserUpdatingId === user.id"
              class="bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {{ roleUserUpdatingId === user.id ? '...' : 'Сменить' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
