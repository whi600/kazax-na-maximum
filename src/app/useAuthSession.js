import { computed, ref } from 'vue'

export const useAuthSession = ({
  authApi,
  defaultPermissionsByRole,
  superAdminEmail,
}) => {
  const currentUser = ref(null)
  const authLoading = ref(true)
  const authBusy = ref(false)
  const authMessage = ref('')
  const permissions = ref(null)
  const isSuperAdmin = ref(false)

  const userRole = computed(() => currentUser.value?.role || null)
  const userName = computed(() => currentUser.value?.name || 'Сотрудник')
  const userPermissions = computed(
    () => permissions.value || defaultPermissionsByRole(userRole.value),
  )
  const canManageProducts = computed(() => Boolean(userPermissions.value.productsManage))
  const canManageSchedule = computed(() => Boolean(userPermissions.value.scheduleManage))
  const canViewAudit = computed(() => Boolean(userPermissions.value.auditView))
  const canManageRoles = computed(() => Boolean(userPermissions.value.rolesManage))
  const isChef = computed(() => userRole.value === 'chef')
  const canAccessSchedule = computed(() => !isChef.value)
  const canAccessArchive = computed(() => isChef.value || canViewAudit.value)

  const clearAuthState = () => {
    currentUser.value = null
    permissions.value = null
    isSuperAdmin.value = false
  }

  const loadPermissions = async () => {
    if (!currentUser.value) {
      clearAuthState()
      return
    }

    try {
      const response = await authApi.permissions()
      permissions.value = response.permissions || defaultPermissionsByRole(userRole.value)
      isSuperAdmin.value = Boolean(response.isSuperAdmin)
    } catch {
      permissions.value = defaultPermissionsByRole(userRole.value)
      isSuperAdmin.value =
        String(currentUser.value.email || '').trim().toLowerCase() === superAdminEmail
    }
  }

  const restoreSession = async (afterAuthenticated) => {
    authLoading.value = true
    try {
      const response = await authApi.me()
      currentUser.value = response.user || null
      if (currentUser.value) {
        await loadPermissions()
        await afterAuthenticated?.(currentUser.value)
      }
    } catch {
      clearAuthState()
    } finally {
      authLoading.value = false
    }
  }

  const authenticate = async ({ request, failureMessage, afterAuthenticated }) => {
    authBusy.value = true
    authMessage.value = ''
    try {
      const response = await request()
      currentUser.value = response.user
      await loadPermissions()
      await afterAuthenticated?.(currentUser.value)
    } catch (error) {
      authMessage.value = error?.message || failureMessage
    } finally {
      authBusy.value = false
    }
  }

  const signIn = ({ email, password }, afterAuthenticated) => authenticate({
    request: () => authApi.login(email, password),
    failureMessage: 'Не удалось войти',
    afterAuthenticated,
  })

  const signUp = ({ email, password, displayName }, afterAuthenticated) => authenticate({
    request: () => authApi.register({ email, password, displayName }),
    failureMessage: 'Не удалось зарегистрироваться',
    afterAuthenticated,
  })

  const endSession = async () => {
    try {
      await authApi.logout()
    } catch {
      // The local session is cleared even if the server is unavailable.
    }
    clearAuthState()
  }

  return {
    currentUser,
    authLoading,
    authBusy,
    authMessage,
    permissions,
    isSuperAdmin,
    userRole,
    userName,
    userPermissions,
    canManageProducts,
    canManageSchedule,
    canViewAudit,
    canManageRoles,
    isChef,
    canAccessSchedule,
    canAccessArchive,
    loadPermissions,
    restoreSession,
    signIn,
    signUp,
    endSession,
  }
}
