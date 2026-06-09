<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { shiftsApi } from '../../api'
import {
  formatDateHeader,
  formatDateInput,
  formatWeekRange,
  getCurrentWeekStart,
  getNextWeekStart,
  getWeekDates,
  getWeekStart,
  isPastDate,
  pickMissingTemplateShifts,
} from '../../scheduleUtils'
import {
  Bell,
} from 'lucide-vue-next'
import ScheduleDaysList from './ScheduleDaysList.vue'
import SchedulePendingRequestsSheet from './SchedulePendingRequestsSheet.vue'
import ScheduleAssignModal from './ScheduleAssignModal.vue'
import ScheduleShiftModal from './ScheduleShiftModal.vue'
import ScheduleSaveStatus from './ScheduleSaveStatus.vue'
import ScheduleWeekDeleteConfirm from './ScheduleWeekDeleteConfirm.vue'
import ScheduleWeekControls from './ScheduleWeekControls.vue'
import { useScheduleBooking } from './composables/useScheduleBooking'
import { useScheduleData } from './composables/useScheduleData'
import { useOverlayScrollLock } from './composables/useOverlayScrollLock'
import { useSchedulePresence } from './composables/useSchedulePresence'

const props = defineProps({
  userRole: { type: String, default: '' },
  currentUser: { type: Object, default: null },
  displayName: { type: String, default: 'Сотрудник' },
  permissions: {
    type: Object,
    default: () => ({
      scheduleManage: false,
    }),
  },
})

const emit = defineEmits(['pending-count'])

const isModalOpen = ref(false)
const isExtraShift = ref(false)
const editingShiftId = ref(null)
const showPendingSheet = ref(false)
const pendingWeekDeleteStart = ref('')
const isDeletingWeek = ref(false)
const blockWeekAddUntil = ref(0)

const isSaving = ref(false)
const structureSaveStatus = ref('idle')
let structureStatusHideTimer = null
let structureAutosaveTimer = null
let suppressStructureAutosave = false
const weekHoldTriggered = ref(false)
let weekHoldTimer = null

const form = ref({ date: '', start_time: '09:00', end_time: '18:00' })

const safeAlert = (message) => alert(message)
const safeConfirm = (message, callback) => callback(window.confirm(message))
const canManageSchedule = computed(
  () => Boolean(props.permissions?.scheduleManage || props.userRole === 'admin'),
)
const { lockPageScroll, unlockPageScroll } = useOverlayScrollLock()
const {
  scheduleEditorsLabel,
  ensureSchedulePresence,
  stopSchedulePresence,
} = useSchedulePresence({ canManageSchedule })
const setSuppressStructureAutosave = (value) => {
  suppressStructureAutosave = value
}
const {
  shifts,
  loading,
  scheduleTemplateShifts,
  selectedWeekStart,
  pendingDeleteIds,
  unsavedNewShifts,
  recentNewShiftIds,
  dismissedNewShiftIds,
  approvedShifts,
  weekStarts,
  selectedWeekDays,
  selectedWeekStats,
  pendingRequests,
  makeTempShift,
  isNewShift,
  markShiftInteracted,
  markDefaultWeeksBootstrapped,
  fetchShifts: fetchScheduleShifts,
  initializeScheduleData,
} = useScheduleData({
  canManageSchedule,
  isCurrentUserShift: (shift) => isCurrentUserShift(shift),
  safeAlert,
})

const isAnyOverlayOpen = computed(
  () =>
    isModalOpen.value ||
    showPendingSheet.value ||
    isAssignModalOpen.value ||
    Boolean(pendingWeekDeleteStart.value),
)

const setStructureSaveStatus = (status) => {
  structureSaveStatus.value = status
  if (structureStatusHideTimer) clearTimeout(structureStatusHideTimer)

  if (status === 'saved' || status === 'error') {
    structureStatusHideTimer = setTimeout(() => {
      structureSaveStatus.value = 'idle'
      structureStatusHideTimer = null
    }, 12000)
  }
}

const structureSaveLabel = computed(() => {
  if (structureSaveStatus.value === 'saving') return 'Сохраняется...'
  if (structureSaveStatus.value === 'error') return 'Ошибка сохранения'
  if (structureSaveStatus.value === 'saved') return 'Сохранено'
  return ''
})

const isEditingShift = computed(() => editingShiftId.value !== null)
const modalEyebrow = computed(() => {
  if (isExtraShift.value) return 'Заявка на помощь'
  if (isEditingShift.value) return 'Редактирование смены'
  return 'Создание смены'
})
const modalTitle = computed(() => {
  if (isExtraShift.value) return 'Нужна помощь'
  if (isEditingShift.value) return 'Изменить смену'
  return 'Новая смена'
})
const modalSubmitLabel = computed(() => {
  if (isExtraShift.value) return 'Отправить заявку'
  if (isEditingShift.value) return 'Сохранить смену'
  return 'Добавить в черновик'
})

const structureSaveClass = computed(() => {
  if (structureSaveStatus.value === 'saving') return 'bg-blue-50 text-blue-600 border-blue-100'
  if (structureSaveStatus.value === 'error') return 'bg-red-50 text-red-500 border-red-100'
  if (structureSaveStatus.value === 'saved') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  return 'bg-slate-50 text-slate-400 border-slate-100'
})

const isWeekAddBlocked = computed(
  () => isDeletingWeek.value || Date.now() < blockWeekAddUntil.value,
)

const pendingWeekDeleteRange = computed(() =>
  pendingWeekDeleteStart.value ? formatWeekRange(pendingWeekDeleteStart.value) : '',
)

const {
  currentUserName,
  isAssignModalOpen,
  assignShiftLabel,
  assignableUsers,
  assignUsersLoading,
  assignUsersError,
  assignBusy,
  selectedAssignUserId,
  resolveUserName,
  isCurrentUserShift,
  canSelfCancelBooking,
  reloadAssignableUsers,
  closeAssignModal,
  assignSelectedUser,
  handleBookClick,
  cancelBooking,
} = useScheduleBooking({
  props,
  canManageSchedule,
  shifts,
  saveStructure: (...args) => saveStructure(...args),
  fetchShifts: (...args) => fetchShifts(...args),
  markShiftInteracted,
  setStructureSaveStatus,
  safeAlert,
  safeConfirm,
})

const fetchShifts = (options = {}) =>
  fetchScheduleShifts({
    ...options,
    setSuppressAutosave: setSuppressStructureAutosave,
  })

const initialize = () =>
  initializeScheduleData({
    resolveUserName,
    setSuppressAutosave: setSuppressStructureAutosave,
  })

const selectWeek = (weekStart) => {
  selectedWeekStart.value = weekStart
}

const onWeekTabClick = (weekStart) => {
  if (weekHoldTriggered.value) {
    weekHoldTriggered.value = false
    return
  }

  selectWeek(weekStart)
}

const cancelWeekHold = () => {
  if (!weekHoldTimer) return
  clearTimeout(weekHoldTimer)
  weekHoldTimer = null
}

const finishWeekHold = () => {
  cancelWeekHold()
  weekHoldTriggered.value = true
}

const waitForStructureSave = async () => {
  while (isSaving.value) {
    await new Promise((resolve) => {
      setTimeout(resolve, 80)
    })
  }
}

const startWeekHold = (weekStart) => {
  if (!canManageSchedule.value) return

  cancelWeekHold()
  weekHoldTriggered.value = false
  weekHoldTimer = setTimeout(() => {
    weekHoldTimer = null
    finishWeekHold()
    openWeekDeleteConfirm(weekStart)
  }, 650)
}

const openWeekDeleteConfirm = (weekStart) => {
  if (!canManageSchedule.value) return

  const weekDateSet = new Set(getWeekDates(weekStart))
  const weekServerShifts = shifts.value.filter((shift) => weekDateSet.has(shift.date))
  const weekUnsavedShifts = unsavedNewShifts.value.filter((shift) => weekDateSet.has(shift.date))
  const hasBookedShift = [...weekServerShifts, ...weekUnsavedShifts].some(
    (shift) => weekDateSet.has(shift.date) && Boolean(shift.employee_name),
  )

  if (hasBookedShift) {
    safeAlert('Нельзя удалить неделю: есть смены с записью сотрудников')
    return
  }

  pendingWeekDeleteStart.value = weekStart
}

const closeWeekDeleteConfirm = () => {
  if (isDeletingWeek.value) return
  pendingWeekDeleteStart.value = ''
}

const deleteWeek = async (weekStart) => {
  if (!canManageSchedule.value || !weekStart || isDeletingWeek.value) return

  markDefaultWeeksBootstrapped()
  isDeletingWeek.value = true
  blockWeekAddUntil.value = Date.now() + 1500
  if (structureAutosaveTimer) {
    clearTimeout(structureAutosaveTimer)
    structureAutosaveTimer = null
  }

  const weekDateSet = new Set(getWeekDates(weekStart))
  const previousSelectedWeekStart = selectedWeekStart.value
  const previousShifts = [...shifts.value]
  const previousUnsavedNewShifts = [...unsavedNewShifts.value]

  suppressStructureAutosave = true

  try {
    await waitForStructureSave()
    const currentWeekServerShifts = shifts.value.filter((shift) =>
      weekDateSet.has(shift.date),
    )

    unsavedNewShifts.value = unsavedNewShifts.value.filter(
      (shift) => !weekDateSet.has(shift.date),
    )
    shifts.value = shifts.value.filter((shift) => !weekDateSet.has(shift.date))

    if (selectedWeekStart.value === weekStart) {
      const remainingWeeks = weekStarts.value.filter((item) => item !== weekStart)
      selectedWeekStart.value = remainingWeeks[0] || getCurrentWeekStart()
    }

    if (currentWeekServerShifts.length > 0) {
      await shiftsApi.deleteWeek(weekStart)
    }

    await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
    setStructureSaveStatus('saved')
    pendingWeekDeleteStart.value = ''
  } catch (error) {
    shifts.value = previousShifts
    unsavedNewShifts.value = previousUnsavedNewShifts
    selectedWeekStart.value = previousSelectedWeekStart
    safeAlert(error?.message || 'Не удалось удалить неделю. Попробуйте еще раз')
  } finally {
    const shouldResumeAutosave = hasStructureChanges.value
    suppressStructureAutosave = false
    isDeletingWeek.value = false
    window.setTimeout(() => {
      blockWeekAddUntil.value = 0
    }, 1500)
    if (shouldResumeAutosave) {
      saveStructure({ silent: true })
    }
  }
}

const addNextWeekTemplate = () => {
  if (!canManageSchedule.value) return
  if (isWeekAddBlocked.value) return

  const lastWeek = weekStarts.value[weekStarts.value.length - 1] || getCurrentWeekStart()
  const nextWeek = getNextWeekStart(lastWeek)
  const missing = pickMissingTemplateShifts(
    [nextWeek],
    approvedShifts.value,
    scheduleTemplateShifts.value,
  )

  if (missing.length === 0) {
    selectedWeekStart.value = nextWeek
    return
  }

  unsavedNewShifts.value.push(...missing.map(makeTempShift))
  selectedWeekStart.value = nextWeek
}

const openModal = (date = null, isHelp = false) => {
  isExtraShift.value = isHelp
  editingShiftId.value = null
  form.value = {
    date: date || new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00',
  }
  isModalOpen.value = true
}

const openEditModal = (shift) => {
  if (!canManageSchedule.value || !shift) return
  markShiftInteracted(shift)

  isExtraShift.value = false
  editingShiftId.value = shift.id
  form.value = {
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
  }
  isModalOpen.value = true
}

const closeModal = () => {
  editingShiftId.value = null
  isExtraShift.value = false
  isModalOpen.value = false
}

defineExpose({
  openCreateShift: () => openModal(),
  openHelpRequest: () => openModal(null, true),
  openPendingRequests: () => {
    showPendingSheet.value = true
  },
})

const handleSaveModal = async () => {
  if (!form.value.date || !form.value.start_time || !form.value.end_time) {
    safeAlert('Заполните дату и время')
    return
  }

  if (form.value.end_time <= form.value.start_time) {
    safeAlert('Время окончания должно быть позже начала')
    return
  }

  if (isPastDate(form.value.date)) {
    safeAlert('Нельзя добавить смену в прошедшую дату')
    return
  }

  if (isEditingShift.value) {
    const shiftId = editingShiftId.value
    if (!Number.isFinite(Number(shiftId))) {
      safeAlert('Не удалось определить смену для редактирования')
      return
    }

    if (Number(shiftId) < 0) {
      unsavedNewShifts.value = unsavedNewShifts.value.map((shift) =>
        shift.id === shiftId
          ? {
              ...shift,
              date: form.value.date,
              start_time: form.value.start_time,
              end_time: form.value.end_time,
            }
          : shift,
      )
      selectedWeekStart.value = getWeekStart(form.value.date)
      closeModal()
      await saveStructure({ silent: true })
      return
    }

    try {
      await shiftsApi.update(shiftId, form.value)
      await fetchShifts()
      selectedWeekStart.value = getWeekStart(form.value.date)
      setStructureSaveStatus('saved')
      closeModal()
    } catch (error) {
      safeAlert(error?.message || 'Не удалось обновить смену')
    }
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
    })
  }

  closeModal()
}

const markForDeletion = (shift) => {
  markShiftInteracted(shift)

  safeConfirm('Удалить эту смену из расписания?', (ok) => {
    if (!ok) return

    if (shift.id < 0) {
      unsavedNewShifts.value = unsavedNewShifts.value.filter(
        (item) => item.id !== shift.id,
      )
    } else {
      if (!pendingDeleteIds.value.includes(shift.id)) {
        pendingDeleteIds.value = [...pendingDeleteIds.value, shift.id]
      }
    }
  })
}

const approveRequest = async (shift) => {
  try {
    await shiftsApi.approve(shift.id)
    shift.status = 'approved'
    if (pendingRequests.value.length === 0) showPendingSheet.value = false
  } catch (error) {
    safeAlert(error?.message || 'Не удалось подтвердить заявку')
  }
}

const rejectRequest = async (shiftId) => {
  try {
    await shiftsApi.remove(shiftId)
    shifts.value = shifts.value.filter((shift) => shift.id !== shiftId)
    if (pendingRequests.value.length === 0) showPendingSheet.value = false
  } catch (error) {
    safeAlert(error?.message || 'Не удалось отклонить заявку')
  }
}

const hasStructureChanges = computed(
  () => unsavedNewShifts.value.length > 0 || pendingDeleteIds.value.length > 0,
)

const getDraftShiftKey = (shift) =>
  `${shift?.date || ''}|${shift?.start_time || ''}|${shift?.end_time || ''}`

const saveStructure = async ({ silent = false } = {}) => {
  if (!hasStructureChanges.value) return true
  if (isSaving.value) return false
  isSaving.value = true
  setStructureSaveStatus('saving')

  const savedDeleteIds = [...pendingDeleteIds.value]
  const savedTempIds = unsavedNewShifts.value.map((shift) => shift.id)
  const savedTempKeys = new Map(
    unsavedNewShifts.value.map((shift) => [shift.id, getDraftShiftKey(shift)]),
  )
  const savedNewShifts = unsavedNewShifts.value.map(({ date, start_time, end_time }) => ({
    date,
    start_time,
    end_time,
  }))

  try {
    const response = await shiftsApi.bulkSave({
      deletedIds: savedDeleteIds,
      newShifts: savedNewShifts,
    })

    pendingDeleteIds.value = pendingDeleteIds.value.filter(
      (id) => !savedDeleteIds.includes(id),
    )
    unsavedNewShifts.value = unsavedNewShifts.value.filter(
      (shift) =>
        !savedTempIds.includes(shift.id) ||
        getDraftShiftKey(shift) !== savedTempKeys.get(shift.id),
    )
    await fetchShifts({
      preserveDrafts: true,
      skipDefaultBootstrap: savedDeleteIds.length > 0,
    })
    const createdIds = Array.isArray(response?.createdIds)
      ? response.createdIds.map(Number).filter(Number.isFinite)
      : []
    if (createdIds.length > 0) {
      const existing = recentNewShiftIds.value.filter(
        (id) => !dismissedNewShiftIds.value.includes(id),
      )
      recentNewShiftIds.value = Array.from(new Set([...existing, ...createdIds]))
    }
    setStructureSaveStatus('saved')
    return true
  } catch (error) {
    setStructureSaveStatus('error')
    if (!silent) safeAlert(error?.message || 'Не удалось сохранить изменения')
    return false
  } finally {
    isSaving.value = false
    if (hasStructureChanges.value && !suppressStructureAutosave) {
      saveStructure({ silent: true })
    }
  }
}

watch(
  () => props.displayName,
  () => {
    resolveUserName()
  },
)

watch(
  weekStarts,
  (weeks) => {
    if (weeks.length === 0) {
      selectedWeekStart.value = getCurrentWeekStart()
      return
    }

    if (!weeks.includes(selectedWeekStart.value)) {
      selectedWeekStart.value = weeks[0]
    }
  },
  { immediate: true },
)

watch(
  pendingRequests,
  (requests) => {
    emit('pending-count', requests.length)
    if (requests.length === 0) showPendingSheet.value = false
  },
  { immediate: true },
)

watch(
  [unsavedNewShifts, () => pendingDeleteIds.value.length],
  () => {
    if (!canManageSchedule.value) return
    if (suppressStructureAutosave) return
    if (!hasStructureChanges.value) return
    if (isModalOpen.value) return

    if (structureAutosaveTimer) clearTimeout(structureAutosaveTimer)
    structureAutosaveTimer = setTimeout(() => {
      saveStructure({ silent: true })
    }, 600)
  },
  { deep: true },
)

onMounted(initialize)
onMounted(ensureSchedulePresence)

watch(
  isAnyOverlayOpen,
  (isOpen) => {
    if (isOpen) {
      lockPageScroll()
      return
    }
    unlockPageScroll()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (structureAutosaveTimer) clearTimeout(structureAutosaveTimer)
  if (structureStatusHideTimer) clearTimeout(structureStatusHideTimer)
  cancelWeekHold()
  stopSchedulePresence()
  unlockPageScroll()
})
</script>

<template>
  <div class="pb-32 bg-slate-50 min-h-screen">
    <div v-if="loading" class="flex flex-col items-center justify-center py-20 opacity-30">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p class="text-[10px] font-black uppercase tracking-widest">Загрузка...</p>
    </div>

    <Transition name="schedule-shell" appear mode="out-in">
      <div v-if="!loading" class="px-3 py-4">
        <div
          v-if="canManageSchedule && scheduleEditorsLabel"
          class="schedule-fade rounded-lg border border-amber-100 bg-amber-50 text-amber-700 px-3 py-2 text-[10px] font-black uppercase mb-3"
        >
          {{ scheduleEditorsLabel }}
        </div>

        <ScheduleWeekControls
          :week-starts="weekStarts"
          :selected-week-start="selectedWeekStart"
          :selected-week-stats="selectedWeekStats"
          :can-manage-schedule="canManageSchedule"
          :add-disabled="isWeekAddBlocked"
          @select-week="onWeekTabClick"
          @hold-week="startWeekHold"
          @cancel-hold="cancelWeekHold"
          @add-week="addNextWeekTemplate"
        />

        <ScheduleDaysList
          :days="selectedWeekDays"
          :approved-count="approvedShifts.length"
          :can-manage-schedule="canManageSchedule"
          :can-self-cancel="canSelfCancelBooking"
          :is-new-shift="isNewShift"
          @book="handleBookClick"
          @cancel="cancelBooking"
          @edit="openEditModal"
          @delete="markForDeletion"
        />
      </div>
    </Transition>

    <ScheduleSaveStatus
      v-if="canManageSchedule && structureSaveLabel"
      :label="structureSaveLabel"
      :status-class="structureSaveClass"
    />

    <ScheduleShiftModal
      v-if="isModalOpen"
      :eyebrow="modalEyebrow"
      :title="modalTitle"
      :submit-label="modalSubmitLabel"
      :formatted-date="formatDateInput(form.date)"
      :date="form.date"
      :start-time="form.start_time"
      :end-time="form.end_time"
      @close="closeModal"
      @submit="handleSaveModal"
      @update:date="form.date = $event"
      @update:start-time="form.start_time = $event"
      @update:end-time="form.end_time = $event"
    />

    <ScheduleAssignModal
      v-if="isAssignModalOpen"
      :users="assignableUsers"
      :selected-user-id="selectedAssignUserId"
      :busy="assignBusy"
      :loading="assignUsersLoading"
      :error-message="assignUsersError"
      :shift-label="assignShiftLabel"
      @close="closeAssignModal"
      @update:selected-user-id="selectedAssignUserId = $event"
      @retry="reloadAssignableUsers"
      @submit="assignSelectedUser"
    />

    <ScheduleWeekDeleteConfirm
      :visible="Boolean(pendingWeekDeleteStart)"
      :week-range="pendingWeekDeleteRange"
      :busy="isDeletingWeek"
      @close="closeWeekDeleteConfirm"
      @confirm="deleteWeek(pendingWeekDeleteStart)"
    />

    <SchedulePendingRequestsSheet
      v-if="showPendingSheet && canManageSchedule"
      :requests="pendingRequests"
      :format-date-header="formatDateHeader"
      @close="showPendingSheet = false"
      @reject="rejectRequest"
      @approve="approveRequest"
    />
  </div>
</template>
