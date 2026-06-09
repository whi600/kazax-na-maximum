<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'

const props = defineProps({
  users: { type: Array, default: () => [] },
  selectedUserId: { type: [Number, String, null], default: null },
  busy: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  shiftLabel: { type: String, default: '' },
})

const emit = defineEmits(['close', 'update:selected-user-id', 'retry', 'submit'])

const search = ref('')
const searchInput = ref(null)

const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const filteredUsers = computed(() => {
  const query = normalizedSearch.value
  if (!query) return props.users

  return props.users.filter((user) =>
    [user.name, user.email, user.role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})

const selectedUser = computed(() =>
  props.users.find((user) => Number(user.id) === Number(props.selectedUserId)),
)

const roleLabel = (role) => {
  if (role === 'admin') return 'Админ'
  if (role === 'chef') return 'Шеф'
  return 'Сотрудник'
}

const selectUser = (userId) => {
  emit('update:selected-user-id', Number(userId))
}

const requestClose = () => {
  if (props.busy) return
  emit('close')
}

watch(
  () => props.selectedUserId,
  (userId) => {
    if (!userId && props.users.length > 0) {
      selectUser(props.users[0].id)
    }
  },
  { immediate: true },
)

onMounted(() => {
  nextTick(() => {
    searchInput.value?.focus()
  })
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[145] flex items-center justify-center overflow-hidden bg-slate-950/45 p-4"
      @click.self="requestClose"
    >
      <div
        class="flex w-full max-w-[380px] max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div class="shrink-0 p-5 pb-3">
          <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-blue-600">
              Запись на смену
            </p>
            <h3 class="mt-1 text-xl font-black text-slate-900">Выберите сотрудника</h3>
            <p v-if="shiftLabel" class="mt-1 text-xs font-black text-slate-400">
              {{ shiftLabel }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg bg-slate-50 p-2 text-slate-400"
            :disabled="busy"
            aria-label="Закрыть"
            @click="requestClose"
          >
            <X class="h-5 w-5" />
          </button>
          </div>

          <label class="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <Search class="h-4 w-4 text-slate-400" />
            <input
              ref="searchInput"
              v-model="search"
              type="search"
              class="w-full bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-300"
              placeholder="Поиск по имени или email"
            />
          </label>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pr-4">
          <div v-if="loading" class="py-8 text-center text-xs font-black uppercase text-slate-300">
            Загружаем сотрудников...
          </div>
          <div v-else-if="errorMessage" class="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
            <p class="text-xs font-black uppercase text-red-500">{{ errorMessage }}</p>
            <button
              type="button"
              class="mt-3 rounded-lg bg-white px-4 py-2 text-xs font-black text-red-500"
              @click="emit('retry')"
            >
              Повторить
            </button>
          </div>
          <div v-else-if="filteredUsers.length === 0" class="py-8 text-center text-xs font-black uppercase text-slate-300">
            Никого не найдено
          </div>
          <template v-else>
            <button
              v-for="user in filteredUsers"
              :key="user.id"
              type="button"
              class="mb-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all"
              :class="
                Number(selectedUserId) === Number(user.id)
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-slate-100 bg-white'
              "
              @click="selectUser(user.id)"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                :class="
                  Number(selectedUserId) === Number(user.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-500'
                "
              >
                {{ String(user.name || user.email || '?').charAt(0).toUpperCase() }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-black text-slate-900">
                  {{ user.name || user.email }}
                </span>
                <span class="block truncate text-[11px] font-bold text-slate-400">
                  {{ roleLabel(user.role) }} · {{ user.email }}
                </span>
              </span>
            </button>
          </template>
        </div>

        <div class="shrink-0 border-t border-slate-100 bg-white p-5 pt-3">
          <div class="mb-3 rounded-lg bg-slate-50 px-3 py-2">
            <p class="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Будет назначен
            </p>
            <p class="mt-0.5 truncate text-sm font-black text-slate-900">
              {{ selectedUser?.name || selectedUser?.email || 'Выберите сотрудника' }}
            </p>
            <p class="mt-0.5 text-[11px] font-bold text-slate-400">
              По умолчанию выбран ваш аккаунт
            </p>
          </div>
          <button
            type="button"
            class="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            :disabled="busy || loading || Boolean(errorMessage) || !selectedUserId"
            @click="emit('submit')"
          >
            {{ busy ? 'Назначаем...' : 'Назначить' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
