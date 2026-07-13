export const useScheduleActions = ({ scheduleViewRef, canManageSchedule }) => {
  const openScheduleAction = () => {
    if (canManageSchedule.value) {
      scheduleViewRef.value?.openCreateShift()
      return
    }
    scheduleViewRef.value?.openHelpRequest()
  }

  const openScheduleRequests = () => {
    scheduleViewRef.value?.openPendingRequests()
  }

  return { openScheduleAction, openScheduleRequests }
}
