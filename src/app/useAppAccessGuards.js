import { watch } from 'vue'

export const useAppAccessGuards = ({
  activeTab,
  profileView,
  isChef,
  isSuperAdmin,
  canAccessArchive,
  canAccessSchedule,
  canManageProducts,
  canManageRoles,
  canManageSchedule,
  navigateTo,
  loadRolePermissions,
  loadRoleUsers,
}) => {
  watch(
    [isChef, canAccessArchive, canAccessSchedule],
    ([chef, archiveAllowed, scheduleAllowed]) => {
      if (chef && activeTab.value !== 'archive') {
        navigateTo('archive', true)
        return
      }

      if (
        (activeTab.value === 'archive' && !archiveAllowed) ||
        (activeTab.value === 'schedule' && !scheduleAllowed)
      ) {
        navigateTo('main', true)
      }
    },
  )

  watch(
    [profileView, canManageProducts, canManageRoles, canManageSchedule, isSuperAdmin],
    ([view]) => {
      if (view === 'assortment' && !canManageProducts.value) {
        profileView.value = 'main'
        return
      }
      if (view === 'roles') {
        if (!canManageRoles.value) {
          profileView.value = 'main'
          return
        }
        loadRolePermissions()
        loadRoleUsers()
      }
      if (
        ['schedule-template', 'employees', 'broadcast'].includes(view) &&
        !canManageSchedule.value
      ) {
        profileView.value = 'main'
      }
      if (view === 'audit' && !isSuperAdmin.value) {
        profileView.value = 'main'
      }
    },
  )
}
