import { onBeforeUnmount, watch } from 'vue'

export const useScheduleStructureAutosave = ({
  canManageSchedule,
  unsavedNewShifts,
  pendingDeleteIds,
  isModalOpen,
  hasStructureChanges,
  suppressAutosave,
  saveStructure,
}) => {
  let timer = null

  const clearAutosave = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  watch(
    [unsavedNewShifts, () => pendingDeleteIds.value.length],
    () => {
      if (!canManageSchedule.value || suppressAutosave.value) return
      if (!hasStructureChanges.value || isModalOpen.value) return

      clearAutosave()
      timer = setTimeout(() => saveStructure({ silent: true }), 600)
    },
    { deep: true },
  )

  onBeforeUnmount(clearAutosave)

  return { clearAutosave }
}
