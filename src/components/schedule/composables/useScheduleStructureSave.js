import { computed, ref } from 'vue'
import { ApiError, shiftsApi } from '../../../api'
import { createOperationId } from '../../../utils/operationId'

const getDraftShiftKey = (shift) =>
  `${shift?.date || ''}|${shift?.start_time || ''}|${shift?.end_time || ''}`

export const useScheduleStructureSave = ({
  scheduleRevision,
  pendingDeleteIds,
  unsavedNewShifts,
  recentNewShiftIds,
  dismissedNewShiftIds,
  suppressAutosave,
  fetchShifts,
  closeModal,
  setSaveStatus,
  safeAlert,
}) => {
  const isSaving = ref(false)
  const scheduleConflict = ref(null)
  const hasStructureChanges = computed(
    () => unsavedNewShifts.value.length > 0 || pendingDeleteIds.value.length > 0,
  )

  const saveStructure = async ({ silent = false, force = false, baseRevision } = {}) => {
    if (!hasStructureChanges.value) return true
    if (isSaving.value || (scheduleConflict.value && !force)) return false

    isSaving.value = true
    setSaveStatus('saving')
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
      setSaveStatus('saved')
      scheduleConflict.value = null
      saveSucceeded = true
      return true
    } catch (error) {
      setSaveStatus('error')
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
      if (saveSucceeded && hasStructureChanges.value && !suppressAutosave.value) {
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
    setSaveStatus('idle')
  }

  const forceScheduleConflict = async () => {
    const conflict = scheduleConflict.value
    if (!conflict) return
    scheduleConflict.value = null
    await conflict.retry({ force: true, baseRevision: conflict.baseRevision })
  }

  return {
    isSaving,
    scheduleConflict,
    hasStructureChanges,
    saveStructure,
    reloadScheduleConflict,
    forceScheduleConflict,
  }
}
