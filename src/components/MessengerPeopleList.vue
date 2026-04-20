<script setup>
import { userInitial } from '../messengerUtils'
import { roleLabels } from '../permissions'

defineProps({
  users: { type: Array, default: () => [] },
  startingUserId: { type: [Number, null], default: null },
})

const emit = defineEmits(['select'])
</script>

<template>
  <section class="rounded-lg border border-slate-100 bg-white shadow-sm">
    <div class="max-h-72 overflow-y-auto">
      <button
        v-for="user in users"
        :key="user.id"
        type="button"
        class="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 active:bg-slate-50"
        @click="emit('select', user)"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[12px] font-black text-blue-600">
          {{ userInitial(user) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[11px] font-black text-slate-800">
            {{ user.name }}
          </span>
          <span class="block truncate text-[9px] font-black uppercase text-slate-400">
            {{ startingUserId === user.id ? 'Открываем...' : roleLabels[user.role] || user.role }}
          </span>
        </span>
      </button>

      <p
        v-if="users.length === 0"
        class="px-3 py-4 text-center text-[10px] font-black uppercase text-slate-300"
      >
        Нет доступных людей
      </p>
    </div>
  </section>
</template>
