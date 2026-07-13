import { ref } from 'vue'
import { ApiError, shiftsApi } from '../../../api'
import { createOperationId } from '../../../utils/operationId'
import { getWeekStart, isPastDate } from '../../../scheduleUtils'

export const useScheduleShiftMutations = ({
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
  setSaveStatus,
  safeAlert,
  safeConfirm,
}) => {
  const scheduleMutationBusy = ref(false)

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
      setSaveStatus('saved')
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
          shift.id === shiftId ? { ...shift, ...form.value } : shift,
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
      unsavedNewShifts.value.push({
        ...form.value,
        id: -Date.now(),
        status: 'approved',
        employee_name: null,
      })
    }
    closeModal()
  }

  const markForDeletion = (shift) => {
    markShiftInteracted(shift)
    safeConfirm('Удалить эту смену из расписания?', (confirmed) => {
      if (!confirmed) return
      if (shift.id < 0) {
        unsavedNewShifts.value = unsavedNewShifts.value.filter(
          (item) => item.id !== shift.id,
        )
        return
      }
      if (!pendingDeleteIds.value.includes(shift.id)) {
        pendingDeleteIds.value = [...pendingDeleteIds.value, shift.id]
      }
    })
  }

  return { scheduleMutationBusy, handleSaveModal, markForDeletion }
}
