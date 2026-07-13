import { computed, ref } from 'vue'

export const useReportSaveStatus = () => {
  const reportSaveStatus = ref('idle')
  let hideTimer = null

  const setReportStatus = (status) => {
    reportSaveStatus.value = status
    if (hideTimer) clearTimeout(hideTimer)

    if (status === 'saved') {
      hideTimer = setTimeout(() => {
        reportSaveStatus.value = 'idle'
        hideTimer = null
      }, 12_000)
    }
  }

  const reportSaveLabel = computed(() => ({
    saving: 'Сохраняется...',
    local: 'Сохранено на устройстве',
    pending: 'Нет связи. Ждет отправки',
    conflict: 'Нужно выбрать версию данных',
    error: 'ОШИБКА СОХРАНЕНИЯ',
    saved: 'Сохранено',
  })[reportSaveStatus.value] || '')

  const reportSaveClass = computed(() => ({
    saving: 'bg-blue-50 text-blue-600 border-blue-100',
    local: 'bg-slate-50 text-slate-600 border-slate-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    conflict: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-500 border-red-100',
    saved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  })[reportSaveStatus.value] || 'bg-slate-50 text-slate-400 border-slate-100')

  const cleanupReportStatus = () => {
    if (hideTimer) clearTimeout(hideTimer)
  }

  return {
    reportSaveStatus,
    reportSaveLabel,
    reportSaveClass,
    setReportStatus,
    cleanupReportStatus,
  }
}
