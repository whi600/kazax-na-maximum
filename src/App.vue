<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, editingApi, recordsApi } from './api'
import ProductSelector from './components/ProductSelector.vue'
import EntryCard from './components/EntryCard.vue'
import AdminArchive from './components/AdminArchive.vue'
import ScheduleView from './components/ScheduleView.vue'
import AuthView from './components/AuthView.vue'
import NavIcon from './components/NavIcon.vue'
import {
  RotateCw,
  LayoutGrid,
  History,
  ShoppingBasket,
  ChefHat,
  CalendarClock,
  LogOut,
  ShieldCheck,
  UserRound,
  Plus,
  HandHelping,
  Bell,
  Pencil,
  Trash2,
  Check,
  ArrowLeft,
  Save,
  SlidersHorizontal,
} from 'lucide-vue-next'

const tabRoutes = {
  main: '/report',
  schedule: '/schedule',
  archive: '/archive',
  profile: '/profile',
}
const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

const routeTabs = Object.fromEntries(
  Object.entries(tabRoutes).map(([tab, route]) => [route, tab]),
)

const getTabFromLocation = () => {
  if (typeof window === 'undefined') return 'main'

  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
  return routeTabs[normalizedPath] || 'main'
}

const activeTab = ref(getTabFromLocation())
const scheduleViewRef = ref(null)
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
const roleLabels = {
  admin: 'Админ',
  chef: 'Шеф',
  employee: 'Сотрудник',
}
const permissionRows = [
  { key: 'reportEdit', label: 'Редактирование отчета' },
  { key: 'productsManage', label: 'Управление ассортиментом' },
  { key: 'scheduleManage', label: 'Управление графиком' },
  { key: 'auditView', label: 'Просмотр истории изменений' },
  { key: 'rolesManage', label: 'Настройка ролей' },
]

const defaultPermissionsByRole = (role) => {
  if (role === 'admin') {
    return {
      reportEdit: true,
      productsManage: true,
      scheduleManage: true,
      auditView: true,
      rolesManage: true,
    }
  }

  if (role === 'chef') {
    return {
      reportEdit: true,
      productsManage: false,
      scheduleManage: false,
      auditView: false,
      rolesManage: false,
    }
  }

  return {
    reportEdit: true,
    productsManage: false,
    scheduleManage: false,
    auditView: false,
    rolesManage: false,
  }
}

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
  if (activeTab.value === 'archive') return 'Архив'
  if (activeTab.value === 'profile' && profileView.value === 'assortment') {
    return 'Ассортимент'
  }
  if (activeTab.value === 'profile' && profileView.value === 'roles') {
    return 'Роли и доступ'
  }
  if (activeTab.value === 'profile') return 'Профиль'
  return 'Отчет'
})

const navItems = computed(() => {
  const items = [
    { tab: 'main', label: 'Отчет', icon: 'report' },
    { tab: 'schedule', label: 'График', icon: 'schedule' },
  ]

  if (canAccessArchive.value) {
    items.push({ tab: 'archive', label: 'Архив', icon: 'archive' })
  }

  items.push({ tab: 'profile', label: 'Профиль', icon: 'profile' })
  return items
})

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
    roleUsers.value = response.users || []
  } catch (error) {
    alert(error?.message || 'Не удалось загрузить список пользователей')
  } finally {
    roleUsersLoading.value = false
  }
}

const changeUserRole = async (targetUser) => {
  if (!canEditUserRole(targetUser)) return
  if (targetUser.id === currentUser.value?.id && !isSuperAdmin.value) {
    alert('Вы не можете менять свою роль')
    return
  }

  roleUserUpdatingId.value = targetUser.id
  try {
    const response = await authApi.updateUserRole(targetUser.id, targetUser.role)
    const updated = response.user
    roleUsers.value = roleUsers.value.map((item) =>
      item.id === updated.id ? updated : item,
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

const closeKeyboard = (event) => {
  if (event.target.tagName !== 'INPUT') {
    document.activeElement?.blur()
  }
}

const groupedEntries = computed(() => {
  const groups = { bakery: [], pastry: [], other: [] }

  dailyEntries.value.forEach((entry) => {
    if (entry.category === 'bakery' || entry.category === 'pastry') {
      groups[entry.category].push(entry)
    } else {
      groups.other.push(entry)
    }
  })

  return groups
})

watch(canAccessArchive, (allowed) => {
  if (activeTab.value === 'archive' && !allowed) {
    navigateTo('main', true)
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
    class="min-h-screen bg-slate-50 text-slate-800 pb-24 select-none touch-manipulation"
    @click="closeKeyboard"
  >
    <div v-if="authLoading" class="flex min-h-screen items-center justify-center">
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
      <header
        class="bg-white/95 backdrop-blur-md px-4 py-3 pt-safe sticky top-0 z-40 border-b border-slate-100 flex justify-between items-center shadow-sm"
      >
        <div>
          <h1
            class="text-xl font-black italic tracking-tighter text-slate-800 leading-none uppercase"
          >
            {{ pageTitle }}
          </h1>
          <p
            class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1"
          >
            Кофетерий
          </p>
        </div>

        <div v-if="activeTab === 'schedule' && userRole" class="flex items-center gap-2">
          <button
            v-if="canManageSchedule && schedulePendingCount > 0"
            @click="openScheduleRequests"
            class="relative bg-white text-blue-600 border border-blue-100 px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Bell class="w-3.5 h-3.5 animate-swing" />
            Заявки
            <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center border-2 border-white">
              {{ schedulePendingCount }}
            </span>
          </button>

          <button
            @click="openScheduleAction"
            class="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg shadow-blue-200 active:scale-95 transition-all"
          >
            <Plus v-if="canManageSchedule" class="w-3.5 h-3.5" />
            <HandHelping v-else class="w-3.5 h-3.5" />
            {{ canManageSchedule ? 'Смена' : 'Помочь' }}
          </button>
        </div>
      </header>

      <main class="p-2">
        <div v-if="appLoading" class="flex justify-center py-10">
          <RotateCw class="w-6 h-6 animate-spin text-blue-600" />
        </div>

        <div v-else-if="activeTab === 'profile'" class="p-2">
          <section
            v-if="profileView === 'main'"
            class="bg-white border border-slate-100 rounded-lg p-5 shadow-sm"
          >
            <div class="flex items-center gap-3 mb-5">
              <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <UserRound class="w-6 h-6" />
              </div>
              <div>
                <h2 class="text-lg font-black text-slate-800">{{ userName }}</h2>
                <p class="text-[10px] font-bold text-slate-400">{{ currentUser?.email }}</p>
              </div>
            </div>

            <div class="space-y-2 mb-5">
              <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-3">
                <span class="text-[10px] font-black text-slate-400 uppercase">Роль</span>
                <span class="text-[10px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase border border-blue-100 flex items-center gap-1">
                  <ShieldCheck class="w-3 h-3" />
                  {{ roleLabels[userRole] || userRole }}
                </span>
              </div>
            </div>

            <button
              v-if="canManageProducts"
              type="button"
              @click="profileView = 'assortment'"
              class="w-full mb-5 bg-blue-600 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Pencil class="w-4 h-4" />
              Редактировать ассортимент
            </button>

            <button
              v-if="canManageRoles"
              type="button"
              @click="profileView = 'roles'"
              class="w-full mb-5 bg-slate-900 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <SlidersHorizontal class="w-4 h-4" />
              Настроить роли и права
            </button>

            <button
              @click="logout"
              class="w-full bg-red-500 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <LogOut class="w-4 h-4" />
              Выйти
            </button>
          </section>

          <section
            v-else-if="profileView === 'assortment'"
            class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm space-y-3"
          >
            <button
              type="button"
              @click="profileView = 'main'; resetProductForm()"
              class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5"
            >
              <ArrowLeft class="w-3.5 h-3.5" />
              Назад в профиль
            </button>

            <div
              v-if="assortmentEditorsLabel"
              class="rounded-lg border border-amber-100 bg-amber-50 text-amber-700 px-3 py-2 text-[10px] font-black uppercase"
            >
              {{ assortmentEditorsLabel }}
            </div>

            <div
              v-if="assortmentLastChangedLabel"
              class="rounded-lg border border-slate-100 bg-slate-50 text-slate-500 px-3 py-2 text-[10px] font-black uppercase"
            >
              {{ assortmentLastChangedLabel }}
            </div>

            <div class="grid grid-cols-12 gap-2">
              <input
                v-model="productForm.name"
                type="text"
                placeholder="Название"
                class="col-span-6 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
              />
              <select
                v-model="productForm.category"
                class="col-span-3 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
              >
                <option value="bakery">Выпечка</option>
                <option value="pastry">Кондитерка</option>
                <option value="other">Другое</option>
              </select>
              <input
                v-model="productForm.unit"
                type="text"
                placeholder="Ед."
                class="col-span-3 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-800"
              />
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                @click="saveProduct"
                :disabled="productSaveBusy"
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Check class="w-3.5 h-3.5" />
                {{ editingProductId ? 'Сохранить' : 'Добавить' }}
              </button>
              <button
                v-if="editingProductId"
                type="button"
                @click="resetProductForm"
                class="bg-slate-100 text-slate-600 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase active:scale-95 transition-all"
              >
                Сброс
              </button>
            </div>

            <div class="max-h-[60vh] overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
              <div
                v-for="product in products"
                :key="product.id"
                class="flex items-center gap-2 px-2.5 py-2 bg-white"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-black text-slate-800 truncate">{{ product.name }}</p>
                  <p class="text-[9px] font-black text-slate-400 uppercase">
                    {{ product.category }} • {{ product.unit }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="startEditProduct(product)"
                  class="text-blue-600 p-1.5 rounded-md active:scale-95 transition-all"
                  aria-label="Редактировать товар"
                >
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  @click="removeProduct(product)"
                  class="text-red-500 p-1.5 rounded-md active:scale-95 transition-all"
                  aria-label="Удалить товар"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section
            v-else
            class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm space-y-3"
          >
            <button
              type="button"
              @click="profileView = 'main'"
              class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5"
            >
              <ArrowLeft class="w-3.5 h-3.5" />
              Назад в профиль
            </button>

            <div
              v-if="roleSettingsBusy && rolePermissions.length === 0"
              class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500"
            >
              Загрузка настроек...
            </div>

            <div
              v-for="roleItem in rolePermissions.filter((row) => row.role === 'chef' || row.role === 'employee')"
              :key="roleItem.role"
              class="rounded-lg border border-slate-100 p-3 space-y-2"
            >
              <h3 class="text-[11px] font-black uppercase text-slate-800">
                {{ roleLabels[roleItem.role] || roleItem.role }}
              </h3>
              <button
                v-for="perm in permissionRows"
                :key="`${roleItem.role}-${perm.key}`"
                type="button"
                @click="toggleRolePermission(roleItem.role, perm.key)"
                class="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition-all"
                :class="
                  roleItem.permissions?.[perm.key]
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-500 border-slate-100'
                "
              >
                <span>{{ perm.label }}</span>
                <span
                  class="inline-flex w-4 h-4 rounded border items-center justify-center"
                  :class="roleItem.permissions?.[perm.key] ? 'border-white/70' : 'border-slate-300'"
                >
                  <Check v-if="roleItem.permissions?.[perm.key]" class="w-3 h-3" />
                </span>
              </button>
            </div>

            <button
              type="button"
              @click="saveRolePermissions"
              :disabled="roleSettingsBusy"
              class="w-full bg-blue-600 text-white py-3 rounded-lg text-[11px] font-black uppercase flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save class="w-4 h-4" />
              Сохранить права
            </button>

            <div class="rounded-lg border border-slate-100 p-3 space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-[11px] font-black uppercase text-slate-800">Пользователи и роли</h3>
                <button
                  type="button"
                  @click="loadRoleUsers"
                  class="text-[10px] font-black uppercase text-blue-600"
                >
                  Обновить
                </button>
              </div>

              <p class="text-[9px] font-black uppercase text-slate-400">
                Супер-админ: {{ SUPER_ADMIN_EMAIL }}
              </p>

              <div
                v-if="roleUsersLoading && roleUsers.length === 0"
                class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase text-slate-500"
              >
                Загрузка пользователей...
              </div>

              <div class="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                <div
                  v-for="u in roleUsers"
                  :key="u.id"
                  class="rounded-lg border border-slate-100 p-2.5 bg-white"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-[11px] font-black text-slate-800 truncate">{{ u.name }}</p>
                      <p class="text-[9px] font-black text-slate-400 truncate">{{ u.email }}</p>
                    </div>
                    <span
                      v-if="u.isSuperAdmin"
                      class="shrink-0 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-1.5 py-1 text-[8px] font-black uppercase"
                    >
                      Супер-админ
                    </span>
                  </div>

                  <div class="mt-2 flex items-center gap-2">
                    <select
                      v-model="u.role"
                      :disabled="!canEditUserRole(u) || roleUserUpdatingId === u.id"
                      class="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-2 text-[10px] font-black text-slate-700 uppercase disabled:opacity-60"
                    >
                      <option value="employee">Сотрудник</option>
                      <option value="chef">Шеф</option>
                      <option value="admin">Админ</option>
                    </select>
                    <button
                      type="button"
                      @click="changeUserRole(u)"
                      :disabled="!canEditUserRole(u) || roleUserUpdatingId === u.id"
                      class="bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {{ roleUserUpdatingId === u.id ? '...' : 'Сменить' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'schedule'">
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
          <div v-if="activeTab === 'archive' && canAccessArchive">
            <AdminArchive
              :lockedMode="!canViewAudit && userRole === 'chef' ? 'records' : ''"
              :hideToggle="!canViewAudit && userRole === 'chef'"
              :canViewAudit="canViewAudit"
            />
          </div>

          <div v-else class="space-y-4">
            <div class="space-y-4">
              <ProductSelector
                :products="products"
                :dailyEntries="dailyEntries"
                :disabled="!canEditReport"
                @add="onAddProduct"
              />

              <div v-for="(items, cat) in groupedEntries" :key="cat" class="space-y-1">
                <h3
                  v-if="items.length"
                  class="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] pt-2 pb-1 ml-1 flex items-center gap-1"
                >
                  <component
                    :is="
                      cat === 'bakery'
                        ? ShoppingBasket
                        : cat === 'pastry'
                          ? ChefHat
                          : LayoutGrid
                    "
                    class="w-2.5 h-2.5"
                  />
                  {{
                    cat === 'bakery'
                      ? 'Выпечка'
                      : cat === 'pastry'
                        ? 'Кондитерка'
                        : 'Другое'
                  }}
                </h3>

                <EntryCard
                  v-for="item in items"
                  :key="item.product_id"
                  :item="item"
                  :editable="canEditReport"
                  @remove="
                    () => {
                      if (!canEditReport) return
                      const idx = dailyEntries.indexOf(item)
                      if (idx > -1) dailyEntries.splice(idx, 1)
                    }
                  "
                />
              </div>

              <div v-if="dailyEntries.length === 0" class="text-center py-10 opacity-20">
                <ShoppingBasket class="w-10 h-10 mx-auto mb-2" />
                <p class="text-[10px] font-black uppercase">Нет товаров в отчете</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <nav
        v-if="userRole"
        class="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-safe nav-safe"
      >
        <div class="max-w-md mx-auto mb-3">
          <div
            class="kof-tabbar"
            :style="{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }"
          >
            <button
              v-for="item in navItems"
              :key="item.tab"
              class="kof-tabbtn"
              @click="navigateTo(item.tab)"
              :aria-label="item.label"
              type="button"
            >
              <span
                class="kof-tabbtn__icon"
                :class="{ 'is-active': activeTab === item.tab }"
              >
                <NavIcon :name="item.icon" class="w-6 h-6" />
              </span>
            </button>
          </div>
        </div>
      </nav>

      <div
        v-if="activeTab === 'main' && canEditReport && reportSaveLabel"
        class="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
        :style="{ bottom: 'calc(86px + env(safe-area-inset-bottom))' }"
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
  padding-bottom: env(safe-area-inset-bottom);
}

.pt-safe {
  padding-top: calc(0.75rem + env(safe-area-inset-top));
}

.nav-safe {
  min-height: calc(4rem + env(safe-area-inset-bottom));
}

.sheet-safe {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}

.sheet-max {
  max-height: calc(100vh - env(safe-area-inset-top) - 0.75rem);
  max-height: calc(100dvh - env(safe-area-inset-top) - 0.75rem);
}

.pb-24 {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom));
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

.kof-tabbar {
  background: rgba(2, 6, 23, 0.95);
  border-radius: 16px;
  height: 56px;
  padding: 0 8px;
  box-shadow: 0 20px 38px rgba(15, 23, 42, 0.24);
  display: grid;
  position: relative;
  overflow: visible;
}

.kof-tabbtn {
  border: 0;
  background: transparent;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.kof-tabbtn__icon {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 190ms ease, color 180ms ease;
  position: relative;
  z-index: 1;
}

.kof-tabbtn__icon.is-active {
  transform: translateY(-8px);
  background-color: #2563eb;
  color: #fff;
}
</style>
