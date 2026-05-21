export const defaultTab = 'main'

export const tabRoutes = {
  main: '/report',
  schedule: '/schedule',
  archive: '/archive',
  profile: '/profile',
}

const routeTabs = Object.fromEntries(
  Object.entries(tabRoutes).map(([tab, route]) => [route, tab]),
)

export const getTabFromPath = (path) => {
  const normalizedPath = String(path || '').replace(/\/+$/, '') || '/'
  if (normalizedPath === '/') return defaultTab
  return routeTabs[normalizedPath] || defaultTab
}

export const getTabFromLocation = () => {
  if (typeof window === 'undefined') return defaultTab
  return getTabFromPath(window.location.pathname)
}

export const buildNavItems = ({ canAccessSchedule = true, canAccessArchive = false } = {}) => {
  const items = [{ tab: 'main', label: 'Отчет', icon: 'report' }]

  if (canAccessSchedule) {
    items.push({ tab: 'schedule', label: 'График', icon: 'schedule' })
  }

  if (canAccessArchive) {
    items.push({ tab: 'archive', label: 'Архив', icon: 'archive' })
  }

  items.push({ tab: 'profile', label: 'Профиль', icon: 'profile' })
  return items
}
