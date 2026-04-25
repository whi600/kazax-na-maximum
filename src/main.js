import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

const BUILD_VERSION_KEY = 'kofeteriy:build-version'

const checkBuildVersion = async () => {
  try {
    const response = await fetch('/app-version.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return

    const payload = await response.json()
    const version = String(payload.version || '')
    if (!version) return

    const current = localStorage.getItem(BUILD_VERSION_KEY)
    if (!current) {
      localStorage.setItem(BUILD_VERSION_KEY, version)
      return
    }

    if (current !== version) {
      localStorage.setItem(BUILD_VERSION_KEY, version)
      window.location.reload()
    }
  } catch {
    // Offline mode should keep using the current cached app.
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => {
        // noop
      })
      checkBuildVersion()
    }).catch(() => {
      // noop
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkBuildVersion()
  })
} else {
  window.addEventListener('load', checkBuildVersion)
}
