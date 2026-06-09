import { computed, ref } from 'vue'

const formatRelativeTime = (value) => {
  if (!value) return ''
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSec < 60) return `${diffSec} сек назад`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffHours = Math.floor(diffMin / 60)
  return `${diffHours} ч назад`
}

export const useAssortmentPresence = ({
  editingApi,
  canManageProducts,
  activeTab,
  profileView,
}) => {
  const assortmentCollabStatus = ref({
    activeEditors: [],
    lastChangedAt: null,
    lastChangedBy: null,
  })
  let assortmentPresenceTimer = null

  const assortmentEditorsLabel = computed(() => {
    const names = assortmentCollabStatus.value.activeEditors.map((item) => item.user_name)
    if (names.length === 0) return ''
    if (names.length === 1) return `Сейчас редактирует: ${names[0]}`
    return `Сейчас редактируют: ${names.join(', ')}`
  })

  const assortmentLastChangedLabel = computed(() => {
    if (!assortmentCollabStatus.value.lastChangedAt) return ''
    const who = assortmentCollabStatus.value.lastChangedBy
      ? ` ${assortmentCollabStatus.value.lastChangedBy}`
      : ''
    return `Последнее изменение${who}: ${formatRelativeTime(assortmentCollabStatus.value.lastChangedAt)}`
  })

  const stopAssortmentPresence = async () => {
    if (assortmentPresenceTimer) {
      clearInterval(assortmentPresenceTimer)
      assortmentPresenceTimer = null
    }

    if (canManageProducts.value) {
      try {
        await editingApi.heartbeat({ resource: 'assortment', active: false })
      } catch {
        // noop
      }
    }
  }

  const syncAssortmentPresence = async () => {
    if (
      !canManageProducts.value ||
      activeTab.value !== 'profile' ||
      profileView.value !== 'assortment'
    ) {
      return
    }

    try {
      await editingApi.heartbeat({ resource: 'assortment', active: true })
      const status = await editingApi.status('assortment')
      assortmentCollabStatus.value = {
        activeEditors: status.activeEditors || [],
        lastChangedAt: status.lastChangedAt || null,
        lastChangedBy: status.lastChangedBy || null,
      }
    } catch {
      // noop
    }
  }

  const ensureAssortmentPresence = async () => {
    if (
      !canManageProducts.value ||
      activeTab.value !== 'profile' ||
      profileView.value !== 'assortment'
    ) {
      await stopAssortmentPresence()
      return
    }

    await syncAssortmentPresence()
    if (assortmentPresenceTimer) clearInterval(assortmentPresenceTimer)
    assortmentPresenceTimer = setInterval(syncAssortmentPresence, 8000)
  }

  const clearAssortmentPresence = () => {
    assortmentCollabStatus.value = {
      activeEditors: [],
      lastChangedAt: null,
      lastChangedBy: null,
    }
  }

  return {
    assortmentEditorsLabel,
    assortmentLastChangedLabel,
    ensureAssortmentPresence,
    stopAssortmentPresence,
    clearAssortmentPresence,
  }
}
