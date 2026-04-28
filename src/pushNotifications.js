const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0))
}

export const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    window.navigator?.standalone === true
  )
}

export const getNotificationPermission = () => {
  if (typeof window === 'undefined') return 'unsupported'
  if (!isStandalonePwa()) return 'unsupported'
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported'
  }
  return Notification.permission
}

const getRegistration = async () => {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

export const getCurrentPushSubscription = async () => {
  const registration = await getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

export const syncPushSubscription = async (notificationsApi) => {
  const permission = getNotificationPermission()
  if (permission !== 'granted') {
    return { subscribed: false, permission }
  }

  const registration = await getRegistration()
  if (!registration) {
    return { subscribed: false, permission: 'unsupported' }
  }

  const settingsResponse = await notificationsApi.settings()
  if (!settingsResponse.pushAvailable || !settingsResponse.publicKey) {
    return { subscribed: false, permission, pushAvailable: false }
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(settingsResponse.publicKey),
    })
  }

  await notificationsApi.subscribe({
    subscription: subscription.toJSON(),
    userAgent: navigator.userAgent,
  })

  return { subscribed: true, permission, pushAvailable: true }
}

export const requestPushPermissionAndSubscribe = async (notificationsApi) => {
  const currentPermission = getNotificationPermission()
  if (currentPermission === 'unsupported') {
    return { subscribed: false, permission: 'unsupported' }
  }

  let permission = currentPermission
  if (permission !== 'granted') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    return { subscribed: false, permission }
  }

  return syncPushSubscription(notificationsApi)
}

export const unsubscribePushSubscription = async (notificationsApi) => {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) return { subscribed: false }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe().catch(() => {
    // noop
  })
  await notificationsApi.unsubscribe(endpoint)

  return { subscribed: false }
}
