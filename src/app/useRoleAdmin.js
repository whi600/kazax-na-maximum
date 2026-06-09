import { ref } from 'vue'

export const useRoleAdmin = ({
  authApi,
  currentUser,
  canManageRoles,
  isSuperAdmin,
  loadPermissions,
}) => {
  const rolePermissions = ref([])
  const roleSettingsBusy = ref(false)
  const roleUsers = ref([])
  const roleUsersLoading = ref(false)
  const roleUserUpdatingId = ref(null)

  const loadRolePermissions = async () => {
    if (!canManageRoles.value) {
      rolePermissions.value = []
      return
    }

    roleSettingsBusy.value = true
    try {
      const response = await authApi.rolePermissions()
      rolePermissions.value = response.roles || []
    } catch (error) {
      alert(error?.message || 'Не удалось загрузить настройки ролей')
    } finally {
      roleSettingsBusy.value = false
    }
  }

  const toggleRolePermission = (roleKey, permissionKey) => {
    rolePermissions.value = rolePermissions.value.map((row) => {
      if (row.role !== roleKey) return row
      return {
        ...row,
        permissions: {
          ...row.permissions,
          [permissionKey]: !row.permissions?.[permissionKey],
        },
      }
    })
  }

  const saveRolePermissions = async () => {
    if (!canManageRoles.value) return

    roleSettingsBusy.value = true
    try {
      const payload = rolePermissions.value
        .filter((row) => row.role === 'chef' || row.role === 'employee')
        .map((row) => ({
          role: row.role,
          permissions: {
            reportEdit: Boolean(row.permissions?.reportEdit),
            productsManage: Boolean(row.permissions?.productsManage),
            scheduleManage: Boolean(row.permissions?.scheduleManage),
            auditView: Boolean(row.permissions?.auditView),
            rolesManage: Boolean(row.permissions?.rolesManage),
          },
        }))

      const response = await authApi.updateRolePermissions(payload)
      rolePermissions.value = response.roles || []
      await loadPermissions()
      alert('Права ролей обновлены')
    } catch (error) {
      alert(error?.message || 'Не удалось сохранить настройки ролей')
    } finally {
      roleSettingsBusy.value = false
    }
  }

  const canEditUserRole = (targetUser) => {
    if (!canManageRoles.value) return false
    if (!targetUser) return false
    if (targetUser.isSuperAdmin) return isSuperAdmin.value
    if (isSuperAdmin.value) return true
    return targetUser.role !== 'admin'
  }

  const loadRoleUsers = async () => {
    if (!canManageRoles.value) {
      roleUsers.value = []
      return
    }

    roleUsersLoading.value = true
    try {
      const response = await authApi.users()
      roleUsers.value = (response.users || []).map((user) => ({
        ...user,
        pendingRole: user.role,
      }))
    } catch (error) {
      alert(error?.message || 'Не удалось загрузить список пользователей')
    } finally {
      roleUsersLoading.value = false
    }
  }

  const updateRoleUserDraft = (targetUser, role) => {
    roleUsers.value = roleUsers.value.map((item) =>
      item.id === targetUser.id ? { ...item, pendingRole: role } : item,
    )
  }

  const changeUserRole = async (targetUser) => {
    if (!canEditUserRole(targetUser)) return
    if (targetUser.id === currentUser.value?.id && !isSuperAdmin.value) {
      alert('Вы не можете менять свою роль')
      return
    }

    const nextRole = targetUser.pendingRole || targetUser.role
    if (nextRole === targetUser.role) return

    roleUserUpdatingId.value = targetUser.id
    try {
      const response = await authApi.updateUserRole(targetUser.id, nextRole)
      const updated = response.user
      roleUsers.value = roleUsers.value.map((item) =>
        item.id === updated.id ? { ...updated, pendingRole: updated.role } : item,
      )
      alert('Роль пользователя обновлена')
    } catch (error) {
      alert(error?.message || 'Не удалось изменить роль')
      await loadRoleUsers()
    } finally {
      roleUserUpdatingId.value = null
    }
  }

  const clearRoleAdminState = () => {
    rolePermissions.value = []
    roleUsers.value = []
    roleUserUpdatingId.value = null
  }

  return {
    rolePermissions,
    roleSettingsBusy,
    roleUsers,
    roleUsersLoading,
    roleUserUpdatingId,
    loadRolePermissions,
    toggleRolePermission,
    saveRolePermissions,
    loadRoleUsers,
    updateRoleUserDraft,
    changeUserRole,
    clearRoleAdminState,
  }
}
