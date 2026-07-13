import { ref, watch } from 'vue'
import { shiftsApi } from '../../../api'

export const useScheduleRequestActions = ({
  shifts,
  pendingRequests,
  scheduleRevision,
  fetchShifts,
  safeAlert,
  onPendingCount,
}) => {
  const showPendingSheet = ref(false)

  const approveRequest = async (request) => {
    try {
      if (request.type === 'unbook') {
        const response = await shiftsApi.approveUnbookRequest(request.id)
        scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
        await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
      } else {
        const response = await shiftsApi.approve(request.id)
        scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
        request.status = 'approved'
      }
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
      } else {
        const response = await shiftsApi.remove(request.id)
        scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
        shifts.value = shifts.value.filter((shift) => shift.id !== request.id)
      }
      if (pendingRequests.value.length === 0) showPendingSheet.value = false
    } catch (error) {
      safeAlert(error?.message || 'Не удалось отклонить заявку')
    }
  }

  watch(
    pendingRequests,
    (requests) => {
      onPendingCount(requests.length)
      if (requests.length === 0) showPendingSheet.value = false
    },
    { immediate: true },
  )

  return { showPendingSheet, approveRequest, rejectRequest }
}
