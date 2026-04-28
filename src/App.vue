<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, editingApi, recordsApi } from './api'
import { buildNavItems, getTabFromLocation, tabRoutes } from './navigation'
import { defaultPermissionsByRole, permissionRows, roleLabels } from './permissions'
import AdminArchive from './components/AdminArchive.vue'
import ScheduleView from './components/ScheduleView.vue'
import AuthView from './components/AuthView.vue'
import MessengerView from './components/MessengerView.vue'
import AppHeader from './components/AppHeader.vue'
import AppBottomNav from './components/AppBottomNav.vue'
import ReportView from './components/ReportView.vue'
import ProfileHomeView from './components/ProfileHomeView.vue'
import AssortmentEditorView from './components/AssortmentEditorView.vue'
import RoleSettingsView from './components/RoleSettingsView.vue'
import NotificationSettingsView from './components/NotificationSettingsView.vue'
import {
  RotateCw,
} from 'lucide-vue-next'

const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

if (typeof window !== 'undefined') {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator?.standalone === true

  document.documentElement.classList.toggle('is-standalone-pwa', Boolean(standalone))
}

const activeTab = ref(getTabFromLocation())
const scheduleViewRef = ref(null)
const messengerViewRef = ref(null)
const messengerSearchOpen = ref(false)
const messengerSearchQuery = ref('')
const messengerChatOpen = ref(false)
const schedulePendingCount = ref(0)
const products = ref([])
const dailyEntries = ref([])

const currentUser = ref(null)
const authLoading = ref(true)
const appLoading = ref(false)
const authBusy = ref(false)
const authMessage = ref('')
let reportAutosaveTimer = null
let suppressReportAutosave = false
const reportSaveStatus = ref('idle')
let reportStatusHideTimer = null
const productSaveBusy = ref(false)
const editingProductId = ref(null)
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
const productForm = ref({
  name: '',
  category: 'other',
  unit: 'шт',
})

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
const canAccessArchive = computed(
  () => canViewAudit.value || userRole.value === 'chef',
)

const pageTitle = computed(() => {
  if (activeTab.value === 'schedule') return 'График'
  if (activeTab.value === 'messenger') return 'Сообщения'
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
  if (activeTab.value === 'profile') return 'Профиль'
  return 'Отчет'
})

const navItems = computed(() => buildNavItems(canAccessArchive.value))

const updateRoute = (tab, replace = false) => {
  if (typeof window === 'undefined') return

  const route = tabRoutes[tab] || tabRoutes.main
  if (window.location.pathname === route) return

  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', route)
}

const navigateTo = (tab, replace = false) => {
  const nextTab = tab === 'archive' && !canAccessArchive.value ? 'main' : tab
  activeTab.value = nextTab
  if (nextTab !== 'messenger') messengerChatOpen.value = false
  if (nextTab !== 'profile') profileView.value = 'main'
  updateRoute(nextTab, replace)
}

const handlePopState = () => {
  navigateTo(getTabFromLocation(), true)
}

const fetchAppData = async () => {
  appLoading.value = true
  authMessage.value = ''
  suppressReportAutosave = true

  try {
    const [, todayResponse] = await Promise.all([loadProducts(), recordsApi.today()])
    dailyEntries.value = (todayResponse.entries || []).map((entry) => ({
      product_id: entry.product_id,
      name: entry.name,
      category: entry.category || 'other',
      arrival: entry.arrival ?? null,
      remainder: entry.remainder ?? null,
      write_off: entry.write_off ?? null,
    }))
  } catch (error) {
    authMessage.value = error?.message || 'Не удалось загрузить данные'
  } finally {
    suppressReportAutosave = false
    appLoading.value = false
  }
}

const resetProductForm = () => {
  editingProductId.value = null
  productForm.value = { name: '', category: 'other', unit: 'шт' }
}

const updateProductFormField = (field, value) => {
  productForm.value = { ...productForm.value, [field]: value }
}

const loadProducts = async () => {
  const productsResponse = await recordsApi.products()
  products.value = productsResponse.products || []
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
    }
  } catch {
    currentUser.value = null
    permissions.value = null
  } finally {
    authLoading.value = false
  }
}

const onAddProduct = (product) => {
  if (!canEditReport.value) return

  if (!dailyEntries.value.find((entry) => entry.product_id === product.id)) {
    dailyEntries.value.unshift({
      product_id: product.id,
      name: product.name,
      category: product.category || 'other',
      arrival: null,
      remainder: null,
      write_off: null,
    })
  }
}

const removeReportEntry = (entry) => {
  if (!canEditReport.value) return

  const idx = dailyEntries.value.indexOf(entry)
  if (idx > -1) dailyEntries.value.splice(idx, 1)
}

const buildReportPayload = () =>
  dailyEntries.value
    .map((entry) => {
      const arrival =
        entry.arrival !== null && entry.arrival !== '' ? Number(entry.arrival) : 0
      const remainder =
        entry.remainder !== null && entry.remainder !== ''
          ? Number(entry.remainder)
          : 0
      const write_off =
        entry.write_off !== null && entry.write_off !== ''
          ? Number(entry.write_off)
          : 0

      return {
        product_id: entry.product_id,
        arrival: Number.isFinite(arrival) ? arrival : 0,
        remainder: Number.isFinite(remainder) ? remainder : 0,
        write_off: Number.isFinite(write_off) ? write_off : 0,
      }
    })
    .filter((entry) => entry.arrival !== 0 || entry.remainder !== 0 || entry.write_off !== 0)

const setReportSaveStatus = (status) => {
  reportSaveStatus.value = status
  if (reportStatusHideTimer) clearTimeout(reportStatusHideTimer)

  if (status === 'saved' || status === 'error') {
    reportStatusHideTimer = setTimeout(() => {
      reportSaveStatus.value = 'idle'
      reportStatusHideTimer = null
    }, 12000)
  }
}

const reportSaveLabel = computed(() => {
  if (reportSaveStatus.value === 'saving') return 'Сохраняется...'
  if (reportSaveStatus.value === 'error') return 'Ошибка сохранения'
  if (reportSaveStatus.value === 'saved') return 'Сохранено'
  return ''
})

const reportSaveClass = computed(() => {
  if (reportSaveStatus.value === 'saving') return 'bg-blue-50 text-blue-600 border-blue-100'
  if (reportSaveStatus.value === 'error') return 'bg-red-50 text-red-500 border-red-100'
  if (reportSaveStatus.value === 'saved') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  return 'bg-slate-50 text-slate-400 border-slate-100'
})

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

const saveReport = async ({ silent = false, autosave = false } = {}) => {
  if (!canEditReport.value) return

  if (autosave) {
    setReportSaveStatus('saving')
  }

  try {
    await recordsApi.saveToday(buildReportPayload())
    if (autosave) {
      setReportSaveStatus('saved')
    }
    if (!silent) alert('✅ Сохранено')
  } catch (error) {
    if (autosave) setReportSaveStatus('error')
    if (!silent) {
      alert('Ошибка: ' + (error?.message || 'Не удалось сохранить отчет'))
    }
  }
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
  if (reportAutosaveTimer) clearTimeout(reportAutosaveTimer)
  navigateTo('main', true)
  products.value = []
  dailyEntries.value = []
  authMessage.value = ''
  setReportSaveStatus('idle')
  resetProductForm()
  profileView.value = 'main'
  assortmentCollabStatus.value = { activeEditors: [], lastChangedAt: null, lastChangedBy: null }
  stopAssortmentPresence()
}

const startEditProduct = (product) => {
  editingProductId.value = product.id
  productForm.value = {
    name: product.name || '',
    category: product.category || 'other',
    unit: product.unit || 'шт',
  }
}

const saveProduct = async () => {
  if (!canManageProducts.value) return

  const payload = {
    name: String(productForm.value.name || '').trim(),
    category: productForm.value.category || 'other',
    unit: String(productForm.value.unit || '').trim() || 'шт',
  }

  if (!payload.name) {
    alert('Введите название товара')
    return
  }

  productSaveBusy.value = true
  try {
    if (editingProductId.value) {
      await recordsApi.updateProduct(editingProductId.value, payload)
    } else {
      await recordsApi.createProduct(payload)
    }

    await loadProducts()
    resetProductForm()
  } catch (error) {
    alert(error?.message || 'Не удалось сохранить товар')
  } finally {
    productSaveBusy.value = false
  }
}

const removeProduct = async (product) => {
  if (!canManageProducts.value) return

  const ok = window.confirm(`Удалить товар "${product.name}"?`)
  if (!ok) return

  productSaveBusy.value = true
  try {
    await recordsApi.deleteProduct(product.id)
    dailyEntries.value = dailyEntries.value.filter(
      (entry) => entry.product_id !== product.id,
    )
    await loadProducts()
    if (editingProductId.value === product.id) {
      resetProductForm()
    }
  } catch (error) {
    alert(error?.message || 'Не удалось удалить товар')
  } finally {
    productSaveBusy.value = false
  }
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

const openMessengerSearch = () => {
  messengerSearchOpen.value = true
  messengerSearchQuery.value = ''
  messengerViewRef.value?.closeConversation?.()
  messengerViewRef.value?.openPeoplePanel?.()
}

const closeMessengerSearch = () => {
  messengerSearchOpen.value = false
  messengerSearchQuery.value = ''
  messengerViewRef.value?.closePeoplePanel?.()
}

const closeKeyboard = (event) => {
  const targetTag = event.target?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return

  const activeTag = document.activeElement?.tagName
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return
  document.activeElement?.blur()
}

watch(canAccessArchive, (allowed) => {
  if (activeTab.value === 'archive' && !allowed) {
    navigateTo('main', true)
  }
})

watch(activeTab, (tab) => {
  if (tab !== 'messenger') {
    closeMessengerSearch()
  }
})

watch(
  [activeTab, profileView, canManageProducts],
  () => {
    ensureAssortmentPresence()
  },
)

watch(profileView, (view) => {
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
})

watch(
  dailyEntries,
  () => {
    if (suppressReportAutosave) return
    if (!currentUser.value || !canEditReport.value) return
    if (activeTab.value !== 'main') return

    if (reportAutosaveTimer) clearTimeout(reportAutosaveTimer)
    reportAutosaveTimer = setTimeout(() => {
      saveReport({ silent: true, autosave: true })
    }, 600)
  },
  { deep: true },
)

onMounted(async () => {
  updateRoute(activeTab.value, true)
  window.addEventListener('popstate', handlePopState)
  await initialize()
})

onBeforeUnmount(() => {
  if (reportAutosaveTimer) clearTimeout(reportAutosaveTimer)
  if (reportStatusHideTimer) clearTimeout(reportStatusHideTimer)
  stopAssortmentPresence()
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div
    class="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-800 pb-24 select-none touch-manipulation"
    @click="closeKeyboard"
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
        v-if="activeTab !== 'profile' && !(activeTab === 'messenger' && messengerChatOpen)"
        v-model:messenger-search-query="messengerSearchQuery"
        :active-tab="activeTab"
        :page-title="pageTitle"
        :user-role="userRole"
        :can-manage-schedule="canManageSchedule"
        :schedule-pending-count="schedulePendingCount"
        :messenger-search-open="messengerSearchOpen"
        @open-messenger-search="openMessengerSearch"
        @close-messenger-search="closeMessengerSearch"
        @open-group-sheet="messengerViewRef?.openGroupSheet('create')"
        @open-schedule-requests="openScheduleRequests"
        @open-schedule-action="openScheduleAction"
      />

      <main :class="activeTab === 'profile' ? 'p-2 pt-safe' : 'p-2'">
        <div v-if="appLoading" class="flex justify-center py-10">
          <RotateCw class="w-6 h-6 animate-spin text-blue-600" />
        </div>

        <div v-else-if="activeTab === 'profile'" class="p-2 page-fade page-stack">
          <ProfileHomeView
            v-if="profileView === 'main'"
            :user-name="userName"
            :email="currentUser?.email"
            :role-label="roleLabels[userRole] || userRole"
            :can-manage-products="canManageProducts"
            :can-manage-roles="canManageRoles"
            @open-assortment="profileView = 'assortment'"
            @open-notifications="profileView = 'notifications'"
            @open-roles="profileView = 'roles'"
            @logout="logout"
          />

          <NotificationSettingsView
            v-else-if="profileView === 'notifications'"
            @back="profileView = 'main'"
          />

          <AssortmentEditorView
            v-else-if="profileView === 'assortment'"
            :products="products"
            :form="productForm"
            :editing-product-id="editingProductId"
            :busy="productSaveBusy"
            :editors-label="assortmentEditorsLabel"
            :last-changed-label="assortmentLastChangedLabel"
            @back="profileView = 'main'; resetProductForm()"
            @update-field="updateProductFormField"
            @save="saveProduct"
            @reset="resetProductForm"
            @edit-product="startEditProduct"
            @remove-product="removeProduct"
          />

          <RoleSettingsView
            v-else
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
            @back="profileView = 'main'"
            @toggle-permission="toggleRolePermission"
            @save-permissions="saveRolePermissions"
            @refresh-users="loadRoleUsers"
            @update-user-role="updateRoleUserDraft"
            @change-user-role="changeUserRole"
          />
        </div>

        <div v-else-if="activeTab === 'schedule'" class="page-fade">
          <ScheduleView
            ref="scheduleViewRef"
            :userRole="userRole"
            :currentUser="currentUser"
            :displayName="userName"
            :permissions="userPermissions"
            @pending-count="schedulePendingCount = $event"
          />
        </div>

        <div v-else-if="activeTab === 'messenger'" class="page-fade">
          <MessengerView
            ref="messengerViewRef"
            :currentUser="currentUser"
            :people-search-query="messengerSearchQuery"
            @person-selected="closeMessengerSearch"
            @chat-open-change="messengerChatOpen = $event"
          />
        </div>

        <div v-else>
          <div v-if="activeTab === 'archive' && canAccessArchive" class="page-fade">
            <AdminArchive
              :lockedMode="!canViewAudit && userRole === 'chef' ? 'records' : ''"
              :hideToggle="!canViewAudit && userRole === 'chef'"
              :canViewAudit="canViewAudit"
            />
          </div>

          <ReportView
            v-else
            :products="products"
            :daily-entries="dailyEntries"
            :editable="canEditReport"
            @add-product="onAddProduct"
            @remove-entry="removeReportEntry"
          />
        </div>
      </main>

      <AppBottomNav
        v-if="userRole && !(activeTab === 'messenger' && messengerChatOpen)"
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

<style>
html {
  --app-safe-bottom: env(safe-area-inset-bottom);
  --app-nav-bottom: calc(0.35rem + var(--app-safe-bottom));
}

@media (display-mode: standalone), (display-mode: fullscreen) {
  html {
    --app-safe-bottom: 0px;
    --app-nav-bottom: 0.35rem;
  }
}

html.is-standalone-pwa {
  --app-safe-bottom: 0px;
  --app-nav-bottom: 0.35rem;
}

::-webkit-scrollbar {
  display: none;
}

* {
  -ms-overflow-style: none;
  scrollbar-width: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
}

body {
  background-color: #f8fafc;
  touch-action: pan-x pan-y;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  overscroll-behavior: none;
}

button,
input,
select,
textarea {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
}

button {
  -webkit-appearance: none;
  appearance: none;
}

input,
select,
textarea {
  -webkit-appearance: none;
  appearance: none;
  border-radius: 0;
}

@supports (-webkit-touch-callout: none) {
  input,
  select,
  textarea {
    font-size: 16px !important;
  }
}

.pb-safe {
  padding-bottom: var(--app-safe-bottom);
}

.pt-safe {
  padding-top: calc(0.75rem + env(safe-area-inset-top));
}

.nav-safe {
  min-height: calc(4rem + var(--app-safe-bottom));
}

.sheet-safe {
  padding-bottom: calc(1rem + var(--app-safe-bottom));
}

.sheet-max {
  max-height: calc(100vh - env(safe-area-inset-top) - 0.75rem);
  max-height: calc(100dvh - env(safe-area-inset-top) - 0.75rem);
}

.pb-24 {
  padding-bottom: calc(6rem + var(--app-safe-bottom));
}

@keyframes swing {
  0%,
  100% {
    transform: rotate(0);
  }
  20% {
    transform: rotate(10deg);
  }
  40% {
    transform: rotate(-10deg);
  }
  60% {
    transform: rotate(5deg);
  }
  80% {
    transform: rotate(-5deg);
  }
}

.animate-swing {
  animation: swing 2s infinite;
}

.page-fade {
  animation: page-fade-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.page-stack > * {
  animation: page-item-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.page-stack > *:nth-child(1) {
  animation-delay: 20ms;
}

.page-stack > *:nth-child(2) {
  animation-delay: 60ms;
}

.page-stack > *:nth-child(3) {
  animation-delay: 100ms;
}

.page-stack > *:nth-child(4) {
  animation-delay: 140ms;
}

.page-stack > *:nth-child(5) {
  animation-delay: 180ms;
}

@keyframes page-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes page-item-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.messenger-search-enter-active,
.messenger-search-leave-active {
  transition:
    opacity 180ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.messenger-search-enter-from,
.messenger-search-leave-to {
  opacity: 0;
  transform: scaleX(0.16);
}

.messenger-search-enter-to,
.messenger-search-leave-from {
  opacity: 1;
  transform: scaleX(1);
}

.messenger-actions-enter-active,
.messenger-actions-leave-active,
.header-title-enter-active,
.header-title-leave-active,
.header-actions-enter-active,
.header-actions-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.messenger-actions-enter-from,
.messenger-actions-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.messenger-actions-enter-to,
.messenger-actions-leave-from {
  opacity: 1;
  transform: translate(0);
}

.header-title-enter-from,
.header-title-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.header-title-enter-to,
.header-title-leave-from,
.header-actions-enter-to,
.header-actions-leave-from {
  opacity: 1;
  transform: translate(0);
}

.header-actions-enter-from,
.header-actions-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
