<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { shiftsApi } from '../api'
import { Calendar, X, Trash2, Save, Check, HandHelping, Bell } from 'lucide-vue-next'

const props = defineProps({
  userRole: { type: String, default: '' },
  currentUser: { type: Object, default: null },
  displayName: { type: String, default: 'Сотрудник' },
})

const shifts = ref([])
const loading = ref(true)
const isModalOpen = ref(false)
const isExtraShift = ref(false)
const currentUserName = ref('Сотрудник')
const showPending = ref(false)

const pendingDeletes = ref(new Set())
const unsavedNewShifts = ref([])
const isSaving = ref(false)

const form = ref({ date: '', start_time: '09:00', end_time: '18:00' })

const safeAlert = (message) => alert(message)
const safeConfirm = (message, callback) => callback(window.confirm(message))

const resolveUserName = () => {
  if (props.displayName?.trim()) {
    currentUserName.value = props.displayName.trim()
    return
  }

  if (props.currentUser?.name) {
    currentUserName.value = props.currentUser.name
    return
  }

  if (props.currentUser?.email?.includes('@')) {
    currentUserName.value = props.currentUser.email.split('@')[0]
    return
  }

  currentUserName.value = 'Сотрудник'
}

const formatDateHeader = (dateStr) => {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const weekDay = date
    .toLocaleDateString('ru-RU', { weekday: 'long' })
    .toUpperCase()

  return `${day}.${month} ${weekDay}`
}

const isPastDate = (dateStr) => {
  const today = new Date().toISOString().split('T')[0]
  return dateStr < today
}

const fetchShifts = async () => {
  try {
    const response = await shiftsApi.upcoming()
    shifts.value = response.shifts || []
    pendingDeletes.value.clear()
    unsavedNewShifts.value = []
  } catch (error) {
    safeAlert(error?.message || 'Ошибка загрузки смен')
  }
}

const initialize = async () => {
  loading.value = true
  resolveUserName()
  await fetchShifts()
  loading.value = false
}

const approvedShifts = computed(() => {
  const all = [
    ...shifts.value.filter(
      (shift) =>
        (shift.status || 'approved') === 'approved' &&
        !pendingDeletes.value.has(shift.id),
    ),
    ...unsavedNewShifts.value,
  ]

  return all.sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.start_time}`)
    const bTime = new Date(`${b.date}T${b.start_time}`)
    return aTime - bTime
  })
})

const groupedShifts = computed(() => {
  const groups = {}

  approvedShifts.value.forEach((shift) => {
    if (!groups[shift.date]) groups[shift.date] = []
    groups[shift.date].push(shift)
  })

  return groups
})

const pendingRequests = computed(() =>
  shifts.value.filter((shift) => (shift.status || 'approved') === 'pending'),
)

const bookShift = (shift) => {
  if (shift.employee_name) return

  safeConfirm(`Записаться на смену ${shift.start_time}-${shift.end_time}?`, async (ok) => {
    if (!ok) return

    try {
      await shiftsApi.book(shift.id)
      shift.employee_name = currentUserName.value
    } catch (error) {
      safeAlert(error?.message || 'Ошибка записи')
    }
  })
}

const cancelBooking = (shift) => {
  safeConfirm(`Убрать запись сотрудника ${shift.employee_name}?`, async (ok) => {
    if (!ok) return

    try {
      await shiftsApi.unbook(shift.id)
      shift.employee_name = null
    } catch (error) {
      safeAlert(error?.message || 'Не удалось убрать запись')
    }
  })
}

const openModal = (date = null, isHelp = false) => {
  isExtraShift.value = isHelp
  form.value = {
    date: date || new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00',
  }
  isModalOpen.value = true
}

const handleSaveModal = async () => {
  if (!form.value.date || !form.value.start_time || !form.value.end_time) {
    safeAlert('Заполните дату и время')
    return
  }

  if (isExtraShift.value) {
    try {
      await shiftsApi.requestHelp(form.value)
      safeAlert('Заявка отправлена ✅')
      await fetchShifts()
    } catch (error) {
      safeAlert(error?.message || 'Не удалось отправить заявку')
      return
    }
  } else {
    const tempId = -Date.now()
    unsavedNewShifts.value.push({
      ...form.value,
      id: tempId,
      status: 'approved',
      employee_name: null,
      is_paid: false,
    })
  }

  isModalOpen.value = false
}

const markForDeletion = (shift) => {
  safeConfirm('Удалить эту смену из расписания?', (ok) => {
    if (!ok) return

    if (shift.id < 0) {
      unsavedNewShifts.value = unsavedNewShifts.value.filter(
        (item) => item.id !== shift.id,
      )
    } else {
      pendingDeletes.value.add(shift.id)
    }
  })
}

const approveRequest = async (shift) => {
  try {
    await shiftsApi.approve(shift.id)
    shift.status = 'approved'
  } catch (error) {
    safeAlert(error?.message || 'Не удалось подтвердить заявку')
  }
}

const rejectRequest = async (shiftId) => {
  try {
    await shiftsApi.remove(shiftId)
    shifts.value = shifts.value.filter((shift) => shift.id !== shiftId)
  } catch (error) {
    safeAlert(error?.message || 'Не удалось отклонить заявку')
  }
}

const saveStructure = async () => {
  isSaving.value = true

  try {
    await shiftsApi.bulkSave({
      deletedIds: Array.from(pendingDeletes.value),
      newShifts: unsavedNewShifts.value.map(({ date, start_time, end_time }) => ({
        date,
        start_time,
        end_time,
      })),
    })

    await fetchShifts()
  } catch (error) {
    safeAlert(error?.message || 'Не удалось сохранить изменения')
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.displayName,
  () => {
    resolveUserName()
  },
)

onMounted(initialize)
</script>

<template>
  <div class="pb-32 bg-slate-50 min-h-screen">
    <div class="px-4 py-4 flex justify-between items-center sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-slate-100">
      <h2 class="text-2xl font-black italic tracking-tighter text-slate-800 uppercase">График</h2>

      <div class="flex gap-2">
        <button
          v-if="userRole === 'admin' && pendingRequests.length > 0"
          @click="showPending = !showPending"
          class="relative p-2 bg-white border border-blue-100 rounded-xl text-blue-600 shadow-sm active:scale-95 transition-all"
        >
          <Bell class="w-5 h-5" :class="{ 'animate-swing': pendingRequests.length > 0 }" />
          <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
            {{ pendingRequests.length }}
          </span>
        </button>

        <button
          v-if="userRole === 'admin'"
          @click="openModal()"
          class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-lg shadow-blue-200"
        >
          + Смена
        </button>

        <button
          v-else
          @click="openModal(null, true)"
          class="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 shadow-lg"
        >
          <HandHelping class="w-3 h-3" />
          Помочь
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex flex-col items-center justify-center py-20 opacity-30">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p class="text-[10px] font-black uppercase tracking-widest">Загрузка...</p>
    </div>

    <div v-else class="px-3 py-4">
      <div v-if="showPending && userRole === 'admin'" class="mb-6 animate-in slide-in-from-top duration-300">
        <div class="bg-blue-600 rounded-3xl p-4 shadow-xl shadow-blue-100">
          <div class="flex justify-between items-center mb-4">
            <h4 class="text-[11px] font-black text-white uppercase flex items-center gap-2">
              <Bell class="w-3.5 h-3.5" />
              Заявки на подтверждение
            </h4>
            <button @click="showPending = false" class="text-white/50">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="space-y-2">
            <div
              v-for="req in pendingRequests"
              :key="req.id"
              class="bg-white p-3 rounded-2xl flex justify-between items-center shadow-inner"
            >
              <div>
                <p class="text-[9px] font-black text-slate-400 uppercase">{{ formatDateHeader(req.date) }}</p>
                <p class="text-xs font-bold text-slate-700">{{ req.start_time }}-{{ req.end_time }}</p>
                <p class="text-[10px] font-bold text-blue-600 uppercase">{{ req.employee_name }}</p>
              </div>
              <div class="flex gap-1">
                <button @click="rejectRequest(req.id)" class="p-2 text-red-500 bg-red-50 rounded-xl">
                  <X class="w-4 h-4" />
                </button>
                <button @click="approveRequest(req)" class="p-2 text-green-600 bg-green-50 rounded-xl">
                  <Check class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-8">
        <div v-for="(dayShifts, date) in groupedShifts" :key="date" class="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h3 class="text-[11px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">{{ formatDateHeader(date) }}</h3>
          <div class="space-y-2">
            <div
              v-for="shift in dayShifts"
              :key="shift.id"
              class="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between transition-all"
              :class="{ 'opacity-50': isPastDate(shift.date) }"
            >
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-black bg-slate-50 px-2 py-1.5 rounded-xl border border-slate-100 text-slate-700">
                  {{ shift.start_time }}–{{ shift.end_time }}
                </span>
                <span v-if="shift.id < 0" class="text-[8px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">
                  New
                </span>
              </div>

              <div class="flex items-center gap-3">
                <div
                  v-if="shift.employee_name"
                  class="flex items-center gap-2 bg-blue-50/50 px-3 py-1.5 rounded-xl border border-blue-100/50"
                >
                  <span class="text-[11px] font-black text-blue-700">{{ shift.employee_name }}</span>
                  <button
                    v-if="userRole === 'admin' || shift.employee_name === currentUserName"
                    @click="cancelBooking(shift)"
                    class="text-red-400 p-0.5 hover:bg-white rounded-md transition-colors"
                  >
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  v-else-if="!isPastDate(shift.date)"
                  @click="bookShift(shift)"
                  class="bg-slate-800 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-md active:scale-95 transition-all"
                >
                  Запись
                </button>

                <button
                  v-if="userRole === 'admin'"
                  @click="markForDeletion(shift)"
                  class="text-slate-200 hover:text-red-400 transition-colors"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="approvedShifts.length === 0" class="text-center py-20 opacity-20">
        <Calendar class="w-12 h-12 mx-auto mb-2" />
        <p class="text-xs font-black uppercase">График не заполнен</p>
      </div>
    </div>

    <div
      v-if="(unsavedNewShifts.length > 0 || pendingDeletes.size > 0) && userRole === 'admin'"
      class="fixed left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-300"
      :style="{ bottom: 'calc(85px + env(safe-area-inset-bottom))' }"
    >
      <button
        @click="saveStructure"
        :disabled="isSaving"
        class="w-full bg-blue-600 text-white py-4 rounded-2xl shadow-2xl shadow-blue-300 font-black uppercase text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        <span
          v-if="isSaving"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        />
        <Save v-else class="w-4 h-4" />
        Сохранить изменения ({{ unsavedNewShifts.length + pendingDeletes.size }})
      </button>
    </div>

    <div v-if="isModalOpen" class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h3 class="text-xl font-black uppercase italic tracking-tighter">
              {{ isExtraShift ? 'Нужна помощь' : 'Новая смена' }}
            </h3>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Заполните детали</p>
          </div>
          <button @click="isModalOpen = false" class="bg-slate-50 p-2 rounded-full text-slate-300">
            <X class="w-6 h-6" />
          </button>
        </div>

        <div class="space-y-6">
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label class="text-[10px] font-black text-slate-400 uppercase mb-2 block">Выберите дату</label>
            <input
              type="date"
              v-model="form.date"
              class="w-full bg-transparent border-none p-0 text-sm font-bold outline-none"
            />
          </div>
          <div class="flex gap-4">
            <div class="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <label class="text-[10px] font-black text-slate-400 uppercase mb-2 block text-center">Начало</label>
              <input
                type="time"
                v-model="form.start_time"
                class="w-full bg-transparent border-none p-0 text-sm font-bold text-center outline-none"
              />
            </div>
            <div class="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <label class="text-[10px] font-black text-slate-400 uppercase mb-2 block text-center">Конец</label>
              <input
                type="time"
                v-model="form.end_time"
                class="w-full bg-transparent border-none p-0 text-sm font-bold text-center outline-none"
              />
            </div>
          </div>
        </div>

        <button
          @click="handleSaveModal"
          class="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] mt-10 shadow-xl shadow-blue-200 active:scale-95 transition-all"
        >
          {{ isExtraShift ? 'Отправить заявку' : 'Добавить в черновик' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes swing {
  0%,
  100% {
    transform: rotate(0);
  }
  20% {
    transform: rotate(10deg);
  }
  40% {
    transform: rotate(-10deg);
  }
  60% {
    transform: rotate(5deg);
  }
  80% {
    transform: rotate(-5deg);
  }
}

.animate-swing {
  animation: swing 2s infinite;
}

::-webkit-scrollbar {
  display: none;
}
</style>
