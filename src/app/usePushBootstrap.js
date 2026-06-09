import {
  getNotificationPermission,
  requestPushPermissionAndSubscribe,
} from '../pushNotifications'

const PUSH_PROMPT_KEY_PREFIX = 'kofeteriy:push-prompt'

export const applyStandalonePwaClass = () => {
  if (typeof window === 'undefined') return

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator?.standalone === true

  document.documentElement.classList.toggle('is-standalone-pwa', Boolean(standalone))
}

const buildPushPromptKey = (userId) => `${PUSH_PROMPT_KEY_PREFIX}:${userId}`

export const usePushBootstrap = ({ notificationsApi }) => {
  const maybeAskForPushPermission = async (user) => {
    if (typeof window === 'undefined' || !user?.id) return

    const permission = getNotificationPermission()
    if (permission === 'unsupported' || permission === 'denied' || permission === 'granted') {
      return
    }

    const promptKey = buildPushPromptKey(user.id)
    if (window.localStorage.getItem(promptKey) === '1') return

    window.localStorage.setItem(promptKey, '1')

    try {
      await requestPushPermissionAndSubscribe(notificationsApi)
    } catch {
      // Push permission prompts are best-effort and must not block login.
    }
  }

  return { maybeAskForPushPermission }
}
