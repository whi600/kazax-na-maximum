import { ref } from 'vue'

const REPORT_COMPLETE_HINT_KEY = 'kofeyny:report-complete-hint-seen:v1'

export const useReportCompletion = ({
  reportCanEditToday,
  reportCompleted,
  reportCompleting,
  isChef,
  completeReport,
}) => {
  const confirmOpen = ref(false)
  const confirmFirstTime = ref(false)

  const openConfirm = () => {
    if (!reportCanEditToday.value || isChef.value || reportCompleting.value) return

    const seen =
      typeof window !== 'undefined' &&
      window.localStorage.getItem(REPORT_COMPLETE_HINT_KEY) === '1'
    confirmFirstTime.value = !seen
    confirmOpen.value = true
  }

  const closeConfirm = () => {
    if (!reportCompleting.value) confirmOpen.value = false
  }

  const confirm = async () => {
    if (reportCompleted.value) {
      closeConfirm()
      return
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REPORT_COMPLETE_HINT_KEY, '1')
    }
    await completeReport()
    confirmOpen.value = false
  }

  return {
    confirmOpen,
    confirmFirstTime,
    openConfirm,
    closeConfirm,
    confirm,
  }
}
