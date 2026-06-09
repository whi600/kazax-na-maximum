import { computed, ref } from 'vue'
import { shiftsApi } from '../../../api'
import {
  formatWeekRange,
  getCurrentWeekStart,
  getWeekDates,
} from '../../../scheduleUtils'

export const useScheduleWeekDeletion = ({
  canManageSchedule,
  shifts,
  unsavedNewShifts,
  weekStarts,
  selectedWeekStart,
  isSaving,
  hasStructureChanges,
  fetchShifts,
  saveStructure,
  markDefaultWeeksBootstrapped,
  setStructureSaveStatus,
  setSuppressStructureAutosave,
  clearStructureAutosave,
  safeAlert,
}) => {
  const pendingWeekDeleteStart = ref('')
  const isDeletingWeek = ref(false)
  const blockWeekAddUntil = ref(0)
  const weekHoldTriggered = ref(false)
  let weekHoldTimer = null

  const isWeekAddBlocked = computed(
    () => isDeletingWeek.value || Date.now() < blockWeekAddUntil.value,
  )

  const pendingWeekDeleteRange = computed(() =>
    pendingWeekDeleteStart.value ? formatWeekRange(pendingWeekDeleteStart.value) : '',
  )

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

  const openWeekDeleteConfirm = (weekStart) => {
    if (!canManageSchedule.value) return

    const weekDateSet = new Set(getWeekDates(weekStart))
    const weekServerShifts = shifts.value.filter((shift) => weekDateSet.has(shift.date))
    const weekUnsavedShifts = unsavedNewShifts.value.filter((shift) =>
      weekDateSet.has(shift.date),
    )
    const hasBookedShift = [...weekServerShifts, ...weekUnsavedShifts].some(
      (shift) => weekDateSet.has(shift.date) && Boolean(shift.employee_name),
    )

    if (hasBookedShift) {
      safeAlert('Нельзя удалить неделю: есть смены с записью сотрудников')
      return
    }

    pendingWeekDeleteStart.value = weekStart
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

  const closeWeekDeleteConfirm = () => {
    if (isDeletingWeek.value) return
    pendingWeekDeleteStart.value = ''
  }

  const deleteWeek = async (weekStart) => {
    if (!canManageSchedule.value || !weekStart || isDeletingWeek.value) return

    markDefaultWeeksBootstrapped()
    isDeletingWeek.value = true
    blockWeekAddUntil.value = Date.now() + 1500
    clearStructureAutosave()

    const weekDateSet = new Set(getWeekDates(weekStart))
    const previousSelectedWeekStart = selectedWeekStart.value
    const previousShifts = [...shifts.value]
    const previousUnsavedNewShifts = [...unsavedNewShifts.value]

    setSuppressStructureAutosave(true)

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
      setSuppressStructureAutosave(false)
      isDeletingWeek.value = false
      window.setTimeout(() => {
        blockWeekAddUntil.value = 0
      }, 1500)
      if (shouldResumeAutosave) {
        saveStructure({ silent: true })
      }
    }
  }

  const cleanupWeekDeletion = () => {
    cancelWeekHold()
  }

  return {
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
  }
}
