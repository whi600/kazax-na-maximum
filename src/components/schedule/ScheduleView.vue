<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  formatDateHeader,
  formatDateInput,
  getCurrentWeekStart,
  getNextWeekStart,
  pickMissingTemplateShifts,
} from '../../scheduleUtils'
import DataConflictDialog from '../shared/conflicts/DataConflictDialog.vue'
import ScheduleAssignModal from './ScheduleAssignModal.vue'
import ScheduleDaysList from './ScheduleDaysList.vue'
import SchedulePendingRequestsSheet from './SchedulePendingRequestsSheet.vue'
import ScheduleSaveStatus from './ScheduleSaveStatus.vue'
import ScheduleShiftModal from './ScheduleShiftModal.vue'
import ScheduleWeekControls from './ScheduleWeekControls.vue'
import ScheduleWeekDeleteConfirm from './ScheduleWeekDeleteConfirm.vue'
import { useOverlayScrollLock } from './composables/useOverlayScrollLock'
import { useScheduleBooking } from './composables/useScheduleBooking'
import { useScheduleData } from './composables/useScheduleData'
import { useSchedulePresence } from './composables/useSchedulePresence'
import { useScheduleRequestActions } from './composables/useScheduleRequestActions'
import { useScheduleSaveStatus } from './composables/useScheduleSaveStatus'
import { useScheduleShiftModal } from './composables/useScheduleShiftModal'
import { useScheduleShiftMutations } from './composables/useScheduleShiftMutations'
import { useScheduleStructureAutosave } from './composables/useScheduleStructureAutosave'
import { useScheduleStructureSave } from './composables/useScheduleStructureSave'
import { useScheduleWeekDeletion } from './composables/useScheduleWeekDeletion'

const props = defineProps({
  userRole: { type: String, default: '' },
  currentUser: { type: Object, default: null },
  displayName: { type: String, default: 'Сотрудник' },
  permissions: {
    type: Object,
    default: () => ({ scheduleManage: false }),
  },
})

const emit = defineEmits(['pending-count'])
const safeAlert = (message) => alert(message)
const safeConfirm = (message, callback) => callback(window.confirm(message))
const canManageSchedule = computed(
  () => Boolean(props.permissions?.scheduleManage || props.userRole === 'admin'),
)
const suppressStructureAutosave = ref(false)
const setSuppressStructureAutosave = (value) => {
  suppressStructureAutosave.value = value
}

const { lockPageScroll, unlockPageScroll } = useOverlayScrollLock()
const {
  scheduleEditorsLabel,
  ensureSchedulePresence,
  stopSchedulePresence,
} = useSchedulePresence({ canManageSchedule })
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
} = useScheduleShiftModal({ canManageSchedule, markShiftInteracted })

const fetchShifts = (options = {}) => fetchScheduleShifts({
  ...options,
  setSuppressAutosave: setSuppressStructureAutosave,
})
const initialize = () => initializeScheduleData({
  resolveUserName,
  setSuppressAutosave: setSuppressStructureAutosave,
})
const {
  label: structureSaveLabel,
  statusClass: structureSaveClass,
  setStatus: setStructureSaveStatus,
} = useScheduleSaveStatus()
const {
  isSaving,
  scheduleConflict,
  hasStructureChanges,
  saveStructure,
  reloadScheduleConflict,
  forceScheduleConflict,
} = useScheduleStructureSave({
  scheduleRevision,
  pendingDeleteIds,
  unsavedNewShifts,
  recentNewShiftIds,
  dismissedNewShiftIds,
  suppressAutosave: suppressStructureAutosave,
  fetchShifts,
  closeModal,
  setSaveStatus: setStructureSaveStatus,
  safeAlert,
})
const {
  scheduleMutationBusy,
  handleSaveModal,
  markForDeletion,
} = useScheduleShiftMutations({
  form,
  isEditingShift,
  editingShiftId,
  isExtraShift,
  unsavedNewShifts,
  pendingDeleteIds,
  selectedWeekStart,
  scheduleRevision,
  scheduleConflict,
  fetchShifts,
  saveStructure,
  closeModal,
  markShiftInteracted,
  setSaveStatus: setStructureSaveStatus,
  safeAlert,
  safeConfirm,
})
const {
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
  saveStructure,
  fetchShifts,
  markShiftInteracted,
  setStructureSaveStatus,
  safeAlert,
  safeConfirm,
})
const {
  showPendingSheet,
  approveRequest,
  rejectRequest,
} = useScheduleRequestActions({
  shifts,
  pendingRequests,
  scheduleRevision,
  fetchShifts,
  safeAlert,
  onPendingCount: (count) => emit('pending-count', count),
})
const { clearAutosave: clearStructureAutosave } = useScheduleStructureAutosave({
  canManageSchedule,
  unsavedNewShifts,
  pendingDeleteIds,
  isModalOpen,
  hasStructureChanges,
  suppressAutosave: suppressStructureAutosave,
  saveStructure,
})
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

const addNextWeekTemplate = () => {
  if (!canManageSchedule.value || isWeekAddBlocked.value) return
  const lastWeek = weekStarts.value.at(-1) || getCurrentWeekStart()
  const nextWeek = getNextWeekStart(lastWeek)
  const missing = pickMissingTemplateShifts(
    [nextWeek],
    approvedShifts.value,
    scheduleTemplateShifts.value,
  )
  if (missing.length > 0) unsavedNewShifts.value.push(...missing.map(makeTempShift))
  selectedWeekStart.value = nextWeek
}

const isAnyOverlayOpen = computed(
  () =>
    isModalOpen.value ||
    showPendingSheet.value ||
    isAssignModalOpen.value ||
    Boolean(pendingWeekDeleteStart.value),
)

defineExpose({
  openCreateShift: () => openModal(),
  openHelpRequest: () => openModal(null, true),
  openPendingRequests: () => {
    showPendingSheet.value = true
  },
  refresh: () => fetchShifts({ preserveDrafts: false, skipDefaultBootstrap: true }),
})

watch(() => props.displayName, resolveUserName)
watch(
  weekStarts,
  (weeks) => {
    if (weeks.length === 0) {
      selectedWeekStart.value = getCurrentWeekStart()
    } else if (!weeks.includes(selectedWeekStart.value)) {
      selectedWeekStart.value = weeks[0]
    }
  },
  { immediate: true },
)
watch(
  isAnyOverlayOpen,
  (isOpen) => {
    if (isOpen) lockPageScroll()
    else unlockPageScroll()
  },
  { immediate: true },
)

onMounted(initialize)
onMounted(ensureSchedulePresence)
onBeforeUnmount(() => {
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
