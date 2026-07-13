import { computed, onBeforeUnmount, ref } from 'vue'

export const useScheduleSaveStatus = () => {
  const status = ref('idle')
  let hideTimer = null

  const setStatus = (nextStatus) => {
    status.value = nextStatus
    if (hideTimer) clearTimeout(hideTimer)

    if (nextStatus === 'saved' || nextStatus === 'error') {
      hideTimer = setTimeout(() => {
        status.value = 'idle'
        hideTimer = null
      }, 12000)
    }
  }

  const label = computed(() => ({
    saving: 'Сохраняется...',
    error: 'Ошибка сохранения',
    saved: 'Сохранено',
  })[status.value] || '')

  const statusClass = computed(() => ({
    saving: 'bg-blue-50 text-blue-600 border-blue-100',
    error: 'bg-red-50 text-red-500 border-red-100',
    saved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  })[status.value] || 'bg-slate-50 text-slate-400 border-slate-100')

  onBeforeUnmount(() => {
    if (hideTimer) clearTimeout(hideTimer)
  })

  return { status, label, statusClass, setStatus }
}
