<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, shiftsApi } from '../../api'
import { createOperationId } from '../../utils/operationId'
import {
  formatDateHeader,
  formatDateInput,
  getCurrentWeekStart,
  getNextWeekStart,
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
import DataConflictDialog from '../shared/conflicts/DataConflictDialog.vue'
import { useScheduleBooking } from './composables/useScheduleBooking'
import { useScheduleData } from './composables/useScheduleData'
import { useOverlayScrollLock } from './composables/useOverlayScrollLock'
import { useSchedulePresence } from './composables/useSchedulePresence'
import { useScheduleShiftModal } from './composables/useScheduleShiftModal'
import { useScheduleWeekDeletion } from './composables/useScheduleWeekDeletion'

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

const showPendingSheet = ref(false)

const isSaving = ref(false)
const scheduleMutationBusy = ref(false)
const structureSaveStatus = ref('idle')
const scheduleConflict = ref(null)
let structureStatusHideTimer = null
let structureAutosaveTimer = null
let suppressStructureAutosave = false

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

const clearStructureAutosave = () => {
  if (!structureAutosaveTimer) return
  clearTimeout(structureAutosaveTimer)
  structureAutosaveTimer = null
}
const {
  shifts,
  scheduleRevision,
  loading,
  scheduleTemplateShifts,
  selectedWeekStart,
  pendingDeleteIds,
  unsavedNewShifts,
  recentNewShiftIds,
  dismissedNewShiftIds,
  showMineOnly,
  approvedShifts,
  weekStarts,
  selectedWeekDays,
  visibleSelectedWeekDays,
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

const {
  isModalOpen,
  isExtraShift,
  editingShiftId,
  form,
  isEditingShift,
  modalEyebrow,
  modalTitle,
  modalSubmitLabel,
  openModal,
  openEditModal,
  closeModal,
} = useScheduleShiftModal({
  canManageSchedule,
  markShiftInteracted,
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

const structureSaveClass = computed(() => {
  if (structureSaveStatus.value === 'saving') return 'bg-blue-50 text-blue-600 border-blue-100'
  if (structureSaveStatus.value === 'error') return 'bg-red-50 text-red-500 border-red-100'
  if (structureSaveStatus.value === 'saved') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  return 'bg-slate-50 text-slate-400 border-slate-100'
})

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
  scheduleRevision,
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

const savePersistedShift = async (
  shiftId,
  payload,
  { force = false, baseRevision } = {},
) => {
  scheduleMutationBusy.value = true
  try {
    const response = await shiftsApi.update(shiftId, payload, {
      operationId: createOperationId(),
      baseRevision: baseRevision ?? scheduleRevision.value,
      force,
    })
    scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
    await fetchShifts()
    selectedWeekStart.value = getWeekStart(payload.date)
    scheduleConflict.value = null
    setStructureSaveStatus('saved')
    closeModal()
    return true
  } catch (error) {
    if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
      scheduleConflict.value = {
        title: 'Смена уже изменена на другом устройстве',
        message: 'Загрузите актуальный график или сохраните выбранные дату и время поверх него.',
        baseRevision: baseRevision ?? scheduleRevision.value,
        currentRevision: Number(error.details?.currentRevision || 0),
        retry: (options) => savePersistedShift(shiftId, payload, options),
      }
    } else {
      safeAlert(error?.message || 'Не удалось обновить смену')
    }
    return false
  } finally {
    scheduleMutationBusy.value = false
  }
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

    await savePersistedShift(shiftId, { ...form.value })
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
    if (shift.type === 'unbook') {
      const response = await shiftsApi.approveUnbookRequest(shift.id)
      scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
      await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
      if (pendingRequests.value.length === 0) showPendingSheet.value = false
      return
    }

    const response = await shiftsApi.approve(shift.id)
    scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
    shift.status = 'approved'
    if (pendingRequests.value.length === 0) showPendingSheet.value = false
  } catch (error) {
    safeAlert(error?.message || 'Не удалось подтвердить заявку')
  }
}

const rejectRequest = async (request) => {
  try {
    if (request?.type === 'unbook') {
      const response = await shiftsApi.rejectUnbookRequest(request.id)
      scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
      await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
      if (pendingRequests.value.length === 0) showPendingSheet.value = false
      return
    }

    const response = await shiftsApi.remove(request.id)
    scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
    shifts.value = shifts.value.filter((shift) => shift.id !== request.id)
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

const saveStructure = async ({ silent = false, force = false, baseRevision } = {}) => {
  if (!hasStructureChanges.value) return true
  if (isSaving.value) return false
  if (scheduleConflict.value && !force) return false
  isSaving.value = true
  setStructureSaveStatus('saving')
  let saveSucceeded = false

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
    const mutationBaseRevision = baseRevision ?? scheduleRevision.value
    const response = await shiftsApi.bulkSave(
      { deletedIds: savedDeleteIds, newShifts: savedNewShifts },
      {
        operationId: createOperationId(),
        baseRevision: mutationBaseRevision,
        force,
      },
    )
    scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)

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
    scheduleConflict.value = null
    saveSucceeded = true
    return true
  } catch (error) {
    setStructureSaveStatus('error')
    if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
      scheduleConflict.value = {
        title: 'График изменен на другом устройстве',
        message: 'Загрузите актуальный график или сохраните свои изменения поверх него.',
        baseRevision: baseRevision ?? scheduleRevision.value,
        currentRevision: Number(error.details?.currentRevision || 0),
        retry: (options) => saveStructure({ silent: true, ...options }),
      }
    } else if (!silent) {
      safeAlert(error?.message || 'Не удалось сохранить изменения')
    }
    return false
  } finally {
    isSaving.value = false
    if (saveSucceeded && hasStructureChanges.value && !suppressStructureAutosave) {
      saveStructure({ silent: true })
    }
  }
}

const reloadScheduleConflict = async () => {
  scheduleConflict.value = null
  closeModal()
  pendingDeleteIds.value = []
  unsavedNewShifts.value = []
  await fetchShifts({ skipDefaultBootstrap: true })
  setStructureSaveStatus('idle')
}

const forceScheduleConflict = async () => {
  const conflict = scheduleConflict.value
  if (!conflict) return
  scheduleConflict.value = null
  await conflict.retry({ force: true, baseRevision: conflict.baseRevision })
}

const {
  pendingWeekDeleteStart,
  isDeletingWeek,
  isWeekAddBlocked,
  pendingWeekDeleteRange,
  onWeekTabClick,
  startWeekHold,
  cancelWeekHold,
  closeWeekDeleteConfirm,
  deleteWeek,
  cleanupWeekDeletion,
} = useScheduleWeekDeletion({
  canManageSchedule,
  shifts,
  unsavedNewShifts,
  weekStarts,
  selectedWeekStart,
  scheduleRevision,
  isSaving,
  hasStructureChanges,
  fetchShifts,
  saveStructure,
  markDefaultWeeksBootstrapped,
  setStructureSaveStatus,
  setSuppressStructureAutosave,
  clearStructureAutosave,
  safeAlert,
  setScheduleConflict: (conflict) => {
    scheduleConflict.value = conflict
  },
})

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
  clearStructureAutosave()
  if (structureStatusHideTimer) clearTimeout(structureStatusHideTimer)
  cleanupWeekDeletion()
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
          :show-mine-only="showMineOnly"
          @select-week="onWeekTabClick"
          @hold-week="startWeekHold"
          @cancel-hold="cancelWeekHold"
          @add-week="addNextWeekTemplate"
          @toggle-mine="showMineOnly = !showMineOnly"
        />

        <ScheduleDaysList
          :days="visibleSelectedWeekDays"
          :approved-count="approvedShifts.length"
          :can-manage-schedule="canManageSchedule"
          :can-self-cancel="canSelfCancelBooking"
          :is-new-shift="isNewShift"
          :show-mine-only="showMineOnly"
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

    <DataConflictDialog
      :conflict="scheduleConflict"
      :busy="isSaving || isDeletingWeek || scheduleMutationBusy"
      @reload="reloadScheduleConflict"
      @force="forceScheduleConflict"
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
