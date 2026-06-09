<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, editingApi, notificationsApi } from './api'
import { defaultPermissionsByRole, permissionRows, roleLabels } from './permissions'
import { applyStandalonePwaClass, usePushBootstrap } from './app/usePushBootstrap'
import { useAppNavigation } from './app/useAppNavigation'
import { useReportState } from './app/useReportState'
import AdminArchive from './components/archive/AdminArchive.vue'
import ScheduleView from './components/schedule/ScheduleView.vue'
import AuthView from './components/shared/AuthView.vue'
import AppHeader from './components/layout/AppHeader.vue'
import AppBottomNav from './components/layout/AppBottomNav.vue'
import ReportView from './components/report/ReportView.vue'
import AppProfileSection from './components/profile/AppProfileSection.vue'
import {
  RotateCw,
} from 'lucide-vue-next'

const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

applyStandalonePwaClass()

const scheduleViewRef = ref(null)
const schedulePendingCount = ref(0)

const currentUser = ref(null)
const authLoading = ref(true)
const appLoading = ref(false)
const authBusy = ref(false)
const authMessage = ref('')
let suppressReportAutosave = false
const profileView = ref('main')
const permissions = ref(null)
const isSuperAdmin = ref(false)
const rolePermissions = ref([])
const roleSettingsBusy = ref(false)
const roleUsers = ref([])
const roleUsersLoading = ref(false)
const roleUserUpdatingId = ref(null)
const assortmentCollabStatus = ref({
  activeEditors: [],
  lastChangedAt: null,
  lastChangedBy: null,
})
let assortmentPresenceTimer = null

const userRole = computed(() => currentUser.value?.role || null)
const userName = computed(() => currentUser.value?.name || 'Сотрудник')
const userPermissions = computed(
  () => permissions.value || defaultPermissionsByRole(userRole.value),
)
const canEditReport = computed(() => Boolean(userPermissions.value.reportEdit))
const canManageProducts = computed(() => Boolean(userPermissions.value.productsManage))
const canManageSchedule = computed(() => Boolean(userPermissions.value.scheduleManage))
const canViewAudit = computed(() => Boolean(userPermissions.value.auditView))
const canManageRoles = computed(() => Boolean(userPermissions.value.rolesManage))
const isChef = computed(() => userRole.value === 'chef')
const canAccessSchedule = computed(() => userRole.value !== 'chef')
const canAccessArchive = computed(() => isChef.value || canViewAudit.value)
const {
  products,
  dailyEntries,
  reportSaveLabel,
  reportSaveClass,
  productSaveBusy,
  editingProductId,
  productForm,
  resetProductForm,
  updateProductFormField,
  loadReportData,
  onAddProduct,
  removeReportEntry,
  saveReport,
  scheduleReportAutosave,
  startEditProduct,
  saveProduct,
  removeProduct,
  clearReportState,
  cleanupReportTimers,
} = useReportState({ canEditReport, canManageProducts })
const {
  activeTab,
  pageTitle,
  navItems,
  navigateTo,
  handlePopState,
  syncRoute,
} = useAppNavigation({
  profileView,
  isChef,
  canAccessArchive,
  canAccessSchedule,
})
const { maybeAskForPushPermission } = usePushBootstrap({ notificationsApi })

const fetchAppData = async () => {
  appLoading.value = true
  authMessage.value = ''
  suppressReportAutosave = true

  try {
    await loadReportData()
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось загрузить данные'
  } finally {
    suppressReportAutosave = false
    appLoading.value = false
  }
}

const loadPermissions = async () => {
  if (!currentUser.value) {
    permissions.value = null
    isSuperAdmin.value = false
    return
  }

  try {
    const response = await authApi.permissions()
    permissions.value = response.permissions || defaultPermissionsByRole(userRole.value)
    isSuperAdmin.value = Boolean(response.isSuperAdmin)
  } catch {
    permissions.value = defaultPermissionsByRole(userRole.value)
    isSuperAdmin.value =
      String(currentUser.value?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL
  }
}

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

const initialize = async () => {
  authLoading.value = true

  try {
    const response = await authApi.me()
    currentUser.value = response.user || null

    if (currentUser.value) {
      await loadPermissions()
      await fetchAppData()
      await maybeAskForPushPermission(currentUser.value)
    }
  } catch {
    currentUser.value = null
    permissions.value = null
  } finally {
    authLoading.value = false
  }
}

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
  if (!canManageProducts.value || activeTab.value !== 'profile' || profileView.value !== 'assortment') {
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
  if (!canManageProducts.value || activeTab.value !== 'profile' || profileView.value !== 'assortment') {
    await stopAssortmentPresence()
    return
  }

  await syncAssortmentPresence()
  if (assortmentPresenceTimer) clearInterval(assortmentPresenceTimer)
  assortmentPresenceTimer = setInterval(() => {
    syncAssortmentPresence()
  }, 8000)
}

const handleSignIn = async ({ email, password }) => {
  authBusy.value = true
  authMessage.value = ''

  try {
    const response = await authApi.login(email, password)
    currentUser.value = response.user
    await loadPermissions()
    navigateTo(getTabFromLocation(), true)
    await fetchAppData()
    await maybeAskForPushPermission(currentUser.value)
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось войти'
  } finally {
    authBusy.value = false
  }
}

const handleSignUp = async ({ email, password, displayName }) => {
  authBusy.value = true
  authMessage.value = ''

  try {
    const response = await authApi.register({ email, password, displayName })
    currentUser.value = response.user
    await loadPermissions()
    navigateTo(getTabFromLocation(), true)
    await fetchAppData()
    await maybeAskForPushPermission(currentUser.value)
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось зарегистрироваться'
  } finally {
    authBusy.value = false
  }
}

const logout = async () => {
  try {
    await authApi.logout()
  } catch {
    // noop
  }

  currentUser.value = null
  permissions.value = null
  isSuperAdmin.value = false
  rolePermissions.value = []
  roleUsers.value = []
  roleUserUpdatingId.value = null
  navigateTo('main', true)
  clearReportState()
  authMessage.value = ''
  profileView.value = 'main'
  assortmentCollabStatus.value = { activeEditors: [], lastChangedAt: null, lastChangedBy: null }
  stopAssortmentPresence()
}

const openScheduleAction = () => {
  if (canManageSchedule.value) {
    scheduleViewRef.value?.openCreateShift()
    return
  }

  scheduleViewRef.value?.openHelpRequest()
}

const openScheduleRequests = () => {
  scheduleViewRef.value?.openPendingRequests()
}

watch([isChef, canAccessArchive, canAccessSchedule], ([chef, archiveAllowed, scheduleAllowed]) => {
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
})

watch(
  [activeTab, profileView, canManageProducts],
  () => {
    ensureAssortmentPresence()
  },
)

watch([profileView, canManageProducts, canManageRoles, canManageSchedule], ([view]) => {
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
  if (view === 'schedule-template' && !canManageSchedule.value) {
    profileView.value = 'main'
  }
})

watch(
  dailyEntries,
  () => {
    if (suppressReportAutosave) return
    scheduleReportAutosave({ currentUser, activeTab })
  },
  { deep: true },
)

onMounted(async () => {
  syncRoute()
  window.addEventListener('popstate', handlePopState)
  await initialize()
})

onBeforeUnmount(() => {
  cleanupReportTimers()
  stopAssortmentPresence()
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div
    class="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-800 pb-24 touch-manipulation"
  >
    <div v-if="authLoading" class="flex min-h-screen min-h-[100dvh] items-center justify-center">
      <RotateCw class="w-7 h-7 animate-spin text-blue-600" />
    </div>

    <AuthView
      v-else-if="!currentUser"
      :loading="authBusy"
      :message="authMessage"
      @sign-in="handleSignIn"
      @sign-up="handleSignUp"
    />

    <template v-else>
      <AppHeader
        v-if="activeTab !== 'profile'"
        :active-tab="activeTab"
        :page-title="pageTitle"
        :user-role="userRole"
        :can-manage-schedule="canManageSchedule"
        :schedule-pending-count="schedulePendingCount"
        @open-schedule-requests="openScheduleRequests"
        @open-schedule-action="openScheduleAction"
      />

      <main :class="activeTab === 'profile' ? 'p-2 pt-safe' : 'p-2'">
        <div v-if="appLoading" class="flex justify-center py-10">
          <RotateCw class="w-6 h-6 animate-spin text-blue-600" />
        </div>

        <AppProfileSection
          v-else-if="activeTab === 'profile'"
          :profile-view="profileView"
          :user-name="userName"
          :email="currentUser?.email"
          :role-label="roleLabels[userRole] || userRole"
          :can-manage-products="canManageProducts"
          :can-manage-schedule="canManageSchedule"
          :can-manage-roles="canManageRoles"
          :products="products"
          :product-form="productForm"
          :editing-product-id="editingProductId"
          :product-save-busy="productSaveBusy"
          :assortment-editors-label="assortmentEditorsLabel"
          :assortment-last-changed-label="assortmentLastChangedLabel"
          :role-permissions="rolePermissions"
          :permission-rows="permissionRows"
          :role-users="roleUsers"
          :role-labels="roleLabels"
          :role-settings-busy="roleSettingsBusy"
          :role-users-loading="roleUsersLoading"
          :role-user-updating-id="roleUserUpdatingId"
          :current-user-id="currentUser?.id"
          :is-super-admin="isSuperAdmin"
          :super-admin-email="SUPER_ADMIN_EMAIL"
          @open-assortment="profileView = 'assortment'"
          @open-notifications="profileView = 'notifications'"
          @open-schedule-template="profileView = 'schedule-template'"
          @open-roles="profileView = 'roles'"
          @logout="logout"
          @back-main="profileView = 'main'; resetProductForm()"
          @update-product-field="updateProductFormField"
          @save-product="saveProduct"
          @reset-product="resetProductForm"
          @edit-product="startEditProduct"
          @remove-product="removeProduct"
          @toggle-permission="toggleRolePermission"
          @save-permissions="saveRolePermissions"
          @refresh-users="loadRoleUsers"
          @update-user-role="updateRoleUserDraft"
          @change-user-role="changeUserRole"
        />

        <div v-else-if="activeTab === 'schedule' && canAccessSchedule" class="page-fade">
          <ScheduleView
            ref="scheduleViewRef"
            :userRole="userRole"
            :currentUser="currentUser"
            :displayName="userName"
            :permissions="userPermissions"
            @pending-count="schedulePendingCount = $event"
          />
        </div>

        <div v-else>
          <div v-if="activeTab === 'archive' && canAccessArchive" class="page-fade">
            <AdminArchive
              :lockedMode="isChef ? 'records' : ''"
              :hideToggle="isChef"
              :canViewAudit="!isChef && canViewAudit"
            />
          </div>

          <ReportView
            v-else
            :products="products"
            :daily-entries="dailyEntries"
            :editable="canEditReport && !isChef"
            @add-product="onAddProduct"
            @remove-entry="removeReportEntry"
          />
        </div>
      </main>

      <AppBottomNav
        v-if="userRole"
        :active-tab="activeTab"
        :items="navItems"
        @navigate="navigateTo"
      />

      <div
        v-if="activeTab === 'main' && canEditReport && reportSaveLabel"
        class="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
        :style="{ bottom: 'calc(86px + var(--app-safe-bottom))' }"
      >
        <div
          class="rounded-full border px-4 py-2 text-[11px] font-black uppercase shadow-sm backdrop-blur-sm"
          :class="reportSaveClass"
        >
          {{ reportSaveLabel }}
        </div>
      </div>
    </template>
  </div>
</template>
