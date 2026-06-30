<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, CalendarClock, RotateCw, UserRound } from 'lucide-vue-next'
import { employeesApi, shiftsApi } from '../../api'
import { formatShiftDay, formatShiftWeekday } from '../../archiveUtils'

const emit = defineEmits(['back'])

const users = ref([])
const selectedUserId = ref(null)
const summary = ref(null)
const usersLoading = ref(false)
const summaryLoading = ref(false)
const errorMessage = ref('')

const selectedUser = computed(() =>
  users.value.find((user) => Number(user.id) === Number(selectedUserId.value)),
)

const roleLabel = (role) => {
  if (role === 'admin') return 'Админ'
  if (role === 'chef') return 'Шеф'
  return 'Сотрудник'
}

const loadSummary = async (userId) => {
  if (!userId) return
  selectedUserId.value = userId
  summaryLoading.value = true
  errorMessage.value = ''

  try {
    summary.value = await employeesApi.summary(userId)
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось загрузить сотрудника'
  } finally {
    summaryLoading.value = false
  }
}

const loadUsers = async () => {
  usersLoading.value = true
  errorMessage.value = ''

  try {
    const response = await shiftsApi.assignableUsers()
    users.value = response.users || []
    if (users.value.length > 0) await loadSummary(users.value[0].id)
  } catch (error) {
    errorMessage.value = error?.message || 'Не удалось загрузить сотрудников'
  } finally {
    usersLoading.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <section class="space-y-4 page-fade">
    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="emit('back')"
        class="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm border border-slate-100"
      >
        <ArrowLeft class="h-5 w-5" />
      </button>
      <div>
        <p class="text-lg font-black uppercase text-slate-800">Сотрудники</p>
        <p class="text-[10px] font-bold uppercase text-slate-400">Профили и смены</p>
      </div>
    </div>

    <div v-if="usersLoading" class="flex justify-center py-10">
      <RotateCw class="h-6 w-6 animate-spin text-blue-600" />
    </div>

    <template v-else>
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          @click="loadSummary(user.id)"
          class="shrink-0 rounded-lg border px-3 py-2 text-left transition-all"
          :class="
            Number(selectedUserId) === Number(user.id)
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-100 bg-white text-slate-500'
          "
        >
          <span class="block max-w-32 truncate text-xs font-black">{{ user.name }}</span>
          <span class="block text-[9px] font-black uppercase opacity-70">{{ roleLabel(user.role) }}</span>
        </button>
      </div>

      <p v-if="errorMessage" class="rounded-lg bg-red-50 p-3 text-center text-xs font-bold text-red-500">
        {{ errorMessage }}
      </p>

      <div v-if="summaryLoading" class="flex justify-center py-10">
        <RotateCw class="h-6 w-6 animate-spin text-blue-600" />
      </div>

      <template v-else-if="summary">
        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserRound class="h-6 w-6" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-lg font-black text-slate-800">{{ selectedUser?.name }}</p>
              <p class="truncate text-[10px] font-bold text-slate-400">{{ selectedUser?.email }}</p>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <CalendarClock class="h-4 w-4 text-blue-600" />
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Ближайшие смены
            </p>
          </div>
          <div v-if="summary.upcoming.length === 0" class="text-xs font-bold text-slate-300">
            Ближайших смен нет
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="shift in summary.upcoming"
              :key="shift.id"
              class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
            >
              <div>
                <p class="text-xs font-black text-slate-800">{{ formatShiftDay(shift.date) }}</p>
                <p class="text-[9px] font-black uppercase text-slate-400">{{ formatShiftWeekday(shift.date) }}</p>
              </div>
              <p class="text-xs font-black text-blue-600">{{ shift.start_time }}-{{ shift.end_time }}</p>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <CalendarClock class="h-4 w-4 text-slate-400" />
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Последние смены
            </p>
          </div>
          <div v-if="summary.recent.length === 0" class="text-xs font-bold text-slate-300">
            Истории смен пока нет
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="shift in summary.recent"
              :key="shift.id"
              class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
            >
              <div>
                <p class="text-xs font-black text-slate-800">{{ formatShiftDay(shift.date) }}</p>
                <p class="text-[9px] font-black uppercase text-slate-400">{{ formatShiftWeekday(shift.date) }}</p>
              </div>
              <p class="text-xs font-black text-slate-500">{{ shift.start_time }}-{{ shift.end_time }}</p>
            </div>
          </div>
        </section>
      </template>
    </template>
  </section>
</template>
