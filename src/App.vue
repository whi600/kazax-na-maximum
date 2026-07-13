<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, editingApi, notificationsApi } from './api'
import { defaultPermissionsByRole, permissionRows, roleLabels } from './permissions'
import { applyStandalonePwaClass, usePushBootstrap } from './app/usePushBootstrap'
import { useAppNavigation } from './app/useAppNavigation'
import { useReportState } from './app/useReportState'
import { useRoleAdmin } from './app/useRoleAdmin'
import { useAssortmentPresence } from './app/useAssortmentPresence'
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
const canAccessSchedule = computed(() => userRole.value !== 'chef')
const canAccessArchive = computed(() => isChef.value || canViewAudit.value)
const reportEditable = computed(
  () =>
    reportCanEditToday.value &&
    !isChef.value &&
    (!reportCompleted.value || userRole.value === 'admin'),
)
const REPORT_COMPLETE_HINT_KEY = 'kofeyny:report-complete-hint-seen:v1'
const reportCompleteConfirmOpen = ref(false)
const reportCompleteConfirmFirstTime = ref(false)
const {
  products,
  dailyEntries,
  reportCanEditToday,
  reportCompleted,
  reportCompletedAt,
  reportCompletedByName,
  reportCompleting,
  reportSaveStatus,
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
  retryReportSave,
  completeReport,
  scheduleReportAutosave,
  startEditProduct,
  saveProduct,
  removeProduct,
  clearReportState,
  cleanupReportTimers,
} = useReportState({ canManageProducts, currentUser })
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
const {
  assortmentEditorsLabel,
  assortmentLastChangedLabel,
  ensureAssortmentPresence,
  stopAssortmentPresence,
  clearAssortmentPresence,
} = useAssortmentPresence({
  editingApi,
  canManageProducts,
  activeTab,
  profileView,
})

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

const {
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
} = useRoleAdmin({
  authApi,
  currentUser,
  canManageRoles,
  isSuperAdmin,
  loadPermissions,
})

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
  clearRoleAdminState()
  navigateTo('main', true)
  clearReportState()
  authMessage.value = ''
  profileView.value = 'main'
  clearAssortmentPresence()
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

const openReportCompleteConfirm = () => {
  if (!reportCanEditToday.value || isChef.value || reportCompleting.value) return

  const seen =
    typeof window !== 'undefined' &&
    window.localStorage.getItem(REPORT_COMPLETE_HINT_KEY) === '1'
  reportCompleteConfirmFirstTime.value = !seen
  reportCompleteConfirmOpen.value = true
}

const closeReportCompleteConfirm = () => {
  if (reportCompleting.value) return
  reportCompleteConfirmOpen.value = false
}

const confirmReportComplete = async () => {
  if (reportCompleted.value) {
    closeReportCompleteConfirm()
    return
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REPORT_COMPLETE_HINT_KEY, '1')
  }

  await completeReport()
  reportCompleteConfirmOpen.value = false
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

watch([profileView, canManageProducts, canManageRoles, canManageSchedule, isSuperAdmin], ([view]) => {
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
  if (view === 'employees' && !canManageSchedule.value) {
    profileView.value = 'main'
  }
  if (view === 'broadcast' && !canManageSchedule.value) {
    profileView.value = 'main'
  }
  if (view === 'audit' && !isSuperAdmin.value) {
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
        :report-can-complete="activeTab === 'main' && reportCanEditToday && !isChef"
        :report-completed="reportCompleted"
        :report-completing="reportCompleting"
        @open-schedule-requests="openScheduleRequests"
        @open-schedule-action="openScheduleAction"
        @complete-report="openReportCompleteConfirm"
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
          @open-employees="profileView = 'employees'"
          @open-roles="profileView = 'roles'"
          @open-audit="profileView = 'audit'"
          @open-broadcast="profileView = 'broadcast'"
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
            :editable="reportEditable"
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
        v-if="activeTab === 'main' && reportCanEditToday && reportSaveLabel"
        class="fixed left-1/2 -translate-x-1/2 z-[120]"
        :class="reportSaveStatus === 'error' ? 'pointer-events-auto' : 'pointer-events-none'"
        :style="{ bottom: 'calc(86px + var(--app-safe-bottom))' }"
      >
        <div
          class="rounded-full border px-4 py-2 text-[11px] font-black uppercase shadow-sm backdrop-blur-sm flex items-center gap-3"
          :class="reportSaveClass"
        >
          <span>{{ reportSaveLabel }}</span>
          <button
            v-if="reportSaveStatus === 'error'"
            type="button"
            @click="retryReportSave"
            class="rounded-full bg-red-500 px-3 py-1 text-[10px] font-black uppercase text-white active:scale-95 transition-all"
          >
            Повторить
          </button>
        </div>
      </div>

      <Teleport to="body">
        <Transition name="sheet">
          <div
            v-if="reportCompleteConfirmOpen"
            class="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm"
            @click.self="closeReportCompleteConfirm"
          >
            <section class="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl">
              <p class="text-[10px] font-black uppercase tracking-widest text-blue-600">
                Подтверждение отчета
              </p>
              <h2 class="mt-1 text-lg font-black text-slate-900">
                {{ reportCompleted ? 'Отчет уже готов' : 'Отметить отчет готовым?' }}
              </h2>
              <p class="mt-2 text-sm font-bold leading-relaxed text-slate-500">
                <template v-if="reportCompleteConfirmFirstTime && !reportCompleted">
                  После подтверждения отчет считается закрытым. Если потом нужно будет
                  изменить отчет или снять статус готовности, это сможет сделать только админ.
                </template>
                <template v-else-if="reportCompleted">
                  Статус уже установлен. Если данные нужно изменить, обратитесь к админу.
                </template>
                <template v-else>
                  Подтвердите, что отчет заполнен и его можно закрыть.
                </template>
              </p>

              <div class="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  :disabled="reportCompleting"
                  @click="closeReportCompleteConfirm"
                  class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-black uppercase text-slate-500 transition-all active:scale-95 disabled:opacity-50"
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  :disabled="reportCompleting"
                  @click="confirmReportComplete"
                  class="rounded-lg bg-blue-600 px-3 py-3 text-[11px] font-black uppercase text-white shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {{ reportCompleting ? 'Сохраняем...' : reportCompleted ? 'Понятно' : 'Подтвердить' }}
                </button>
              </div>
            </section>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>
