import { computed, ref } from 'vue'
import { buildNavItems, getTabFromLocation, tabRoutes } from '../navigation'

export const useAppNavigation = ({
  profileView,
  isChef,
  canAccessArchive,
  canAccessSchedule,
}) => {
  const activeTab = ref(getTabFromLocation())

  const pageTitle = computed(() => {
    if (activeTab.value === 'schedule') return 'График'
    if (activeTab.value === 'archive') return 'Архив'
    if (activeTab.value === 'profile' && profileView.value === 'assortment') {
      return 'Ассортимент'
    }
    if (activeTab.value === 'profile' && profileView.value === 'roles') {
      return 'Роли и доступ'
    }
    if (activeTab.value === 'profile' && profileView.value === 'notifications') {
      return 'Уведомления'
    }
    if (activeTab.value === 'profile' && profileView.value === 'broadcast') {
      return 'Оповещение всем'
    }
    if (activeTab.value === 'profile' && profileView.value === 'schedule-template') {
      return 'Базовое расписание'
    }
    if (activeTab.value === 'profile' && profileView.value === 'employees') {
      return 'Сотрудники'
    }
    if (activeTab.value === 'profile' && profileView.value === 'audit') {
      return 'Журнал изменений'
    }
    if (activeTab.value === 'profile') return 'Профиль'
    return 'Отчет'
  })

  const navItems = computed(() =>
    isChef.value
      ? [{ tab: 'archive', label: 'Архив', icon: 'archive' }]
      : buildNavItems({
          canAccessSchedule: canAccessSchedule.value,
          canAccessArchive: canAccessArchive.value,
        }),
  )

  const updateRoute = (tab, replace = false) => {
    if (typeof window === 'undefined') return

    const route = tabRoutes[tab] || tabRoutes.main
    if (window.location.pathname === route) return

    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', route)
  }

  const navigateTo = (tab, replace = false) => {
    if (isChef.value) {
      activeTab.value = 'archive'
      profileView.value = 'main'
      updateRoute('archive', replace)
      return
    }

    const nextTab =
      (tab === 'archive' && !canAccessArchive.value) ||
      (tab === 'schedule' && !canAccessSchedule.value)
        ? 'main'
        : tab
    activeTab.value = nextTab
    if (nextTab !== 'profile') profileView.value = 'main'
    updateRoute(nextTab, replace)
  }

  const handlePopState = () => {
    navigateTo(getTabFromLocation(), true)
  }

  const syncRoute = () => {
    updateRoute(activeTab.value, true)
  }

  return {
    activeTab,
    pageTitle,
    navItems,
    navigateTo,
    handlePopState,
    syncRoute,
  }
}
