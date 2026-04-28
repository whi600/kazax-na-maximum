<script setup>
import { RotateCw, Search, Users, X } from 'lucide-vue-next'
import { roleLabels } from '../permissions'
import { userInitial } from '../messengerUtils'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  mode: { type: String, required: true },
  groupTitle: { type: String, default: '' },
  searchQuery: { type: String, default: '' },
  selectedUsers: { type: Array, default: () => [] },
  searchUsers: { type: Array, default: () => [] },
  selectedMemberIds: { type: Array, default: () => [] },
  canSubmit: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'submit',
  'toggle-member',
  'update:groupTitle',
  'update:searchQuery',
])
</script>

<template>
  <Transition name="sheet-fade">
    <div
      class="fixed inset-0 z-[220] flex items-end bg-slate-950/45 px-2 pb-2 pt-safe backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <section class="max-h-[86vh] w-full overflow-hidden rounded-lg bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 class="text-[13px] font-black uppercase text-slate-800">
              {{ title }}
            </h2>
            <p class="text-[9px] font-black uppercase text-slate-400">
              {{ subtitle }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:scale-95"
            aria-label="Закрыть"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="space-y-3 overflow-y-auto p-4">
          <input
            v-if="mode === 'create'"
            :value="groupTitle"
            type="text"
            maxlength="80"
            placeholder="Название группы"
            class="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 px-3 text-[12px] font-bold text-slate-800 placeholder:text-slate-300"
            @input="emit('update:groupTitle', $event.target.value)"
          />

          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              :value="searchQuery"
              type="text"
              placeholder="Найти участника"
              class="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 pl-9 pr-3 text-[12px] font-bold text-slate-800 placeholder:text-slate-300"
              @input="emit('update:searchQuery', $event.target.value)"
            />
          </div>

          <div v-if="selectedUsers.length" class="flex flex-wrap gap-1.5">
            <button
              v-for="user in selectedUsers"
              :key="user.id"
              type="button"
              class="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-600"
              @click="emit('toggle-member', user.id)"
            >
              {{ user.name }}
              <X class="h-3 w-3" />
            </button>
          </div>

          <div class="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
            <button
              v-for="user in searchUsers"
              :key="user.id"
              type="button"
              class="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 active:bg-slate-50"
              @click="emit('toggle-member', user.id)"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-black"
                :class="
                  selectedMemberIds.includes(user.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-600'
                "
              >
                {{ userInitial(user) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[11px] font-black text-slate-800">
                  {{ user.name }}
                </span>
                <span class="block truncate text-[9px] font-black uppercase text-slate-400">
                  {{ roleLabels[user.role] || user.role }}
                </span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                :class="
                  selectedMemberIds.includes(user.id)
                    ? 'border-blue-600 bg-blue-600'
                    : 'border-slate-200 bg-white'
                "
              >
                <span v-if="selectedMemberIds.includes(user.id)" class="h-2 w-2 rounded-sm bg-white" />
              </span>
            </button>

            <p
              v-if="searchUsers.length === 0"
              class="px-3 py-4 text-center text-[10px] font-black uppercase text-slate-300"
            >
              Нет доступных участников
            </p>
          </div>

          <button
            type="button"
            :disabled="!canSubmit"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-[11px] font-black uppercase text-white transition-all disabled:opacity-40 active:scale-95"
            @click="emit('submit')"
          >
            <RotateCw v-if="busy" class="h-4 w-4 animate-spin" />
            <Users v-else class="h-4 w-4" />
            {{ mode === 'add' ? 'Добавить' : 'Создать группу' }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
