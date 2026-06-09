import { computed, ref } from 'vue'
import { editingApi } from '../../../api'

export const useSchedulePresence = ({ canManageSchedule }) => {
  const scheduleCollabStatus = ref({
    activeEditors: [],
    lastChangedAt: null,
    lastChangedBy: null,
  })
  let schedulePresenceTimer = null

  const scheduleEditorsLabel = computed(() => {
    const names = scheduleCollabStatus.value.activeEditors.map((item) => item.user_name)
    if (names.length === 0) return ''
    if (names.length === 1) return `Сейчас редактирует: ${names[0]}`
    return `Сейчас редактируют: ${names.join(', ')}`
  })

  const syncSchedulePresence = async () => {
    if (!canManageSchedule.value) return

    try {
      await editingApi.heartbeat({ resource: 'schedule', active: true })
      const status = await editingApi.status('schedule')
      scheduleCollabStatus.value = {
        activeEditors: status.activeEditors || [],
        lastChangedAt: status.lastChangedAt || null,
        lastChangedBy: status.lastChangedBy || null,
      }
    } catch {
      // Presence is advisory; schedule editing should keep working if it fails.
    }
  }

  const stopSchedulePresence = async () => {
    if (schedulePresenceTimer) {
      clearInterval(schedulePresenceTimer)
      schedulePresenceTimer = null
    }

    if (canManageSchedule.value) {
      try {
        await editingApi.heartbeat({ resource: 'schedule', active: false })
      } catch {
        // noop
      }
    }
  }

  const ensureSchedulePresence = async () => {
    if (!canManageSchedule.value) {
      await stopSchedulePresence()
      return
    }

    await syncSchedulePresence()
    if (schedulePresenceTimer) clearInterval(schedulePresenceTimer)
    schedulePresenceTimer = setInterval(() => {
      syncSchedulePresence()
    }, 8000)
  }

  return {
    scheduleEditorsLabel,
    ensureSchedulePresence,
    stopSchedulePresence,
  }
}
