<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { authApi, editingApi, notificationsApi } from './api'
import { defaultPermissionsByRole, permissionRows, roleLabels } from './permissions'
import { getTabFromLocation } from './navigation'
import { useAppAccessGuards } from './app/useAppAccessGuards'
import { useAppDataLoader } from './app/useAppDataLoader'
import { useAuthSession } from './app/useAuthSession'
import { applyStandalonePwaClass, usePushBootstrap } from './app/usePushBootstrap'
import { useAppNavigation } from './app/useAppNavigation'
import { useReportState } from './app/useReportState'
import { useReportCompletion } from './app/useReportCompletion'
import { useRoleAdmin } from './app/useRoleAdmin'
import { useScheduleActions } from './app/useScheduleActions'
import { useAssortmentPresence } from './app/useAssortmentPresence'
import AdminArchive from './components/archive/AdminArchive.vue'
import ScheduleView from './components/schedule/ScheduleView.vue'
import AuthView from './components/shared/AuthView.vue'
import DataConflictDialog from './components/shared/conflicts/DataConflictDialog.vue'
import ReportConflictDialog from './components/shared/conflicts/ReportConflictDialog.vue'
import AppHeader from './components/layout/AppHeader.vue'
import AppBottomNav from './components/layout/AppBottomNav.vue'
import ReportCompletionDialog from './components/report/ReportCompletionDialog.vue'
import ReportSaveStatusToast from './components/report/ReportSaveStatusToast.vue'
import ReportView from './components/report/ReportView.vue'
import AppProfileSection from './components/profile/AppProfileSection.vue'
import { RotateCw } from 'lucide-vue-next'

const SUPER_ADMIN_EMAIL = 'misakurnikov942@gmail.com'

applyStandalonePwaClass()

const scheduleViewRef = ref(null)
const schedulePendingCount = ref(0)
const profileView = ref('main')
const {
  currentUser,
  authLoading,
  authBusy,
  authMessage,
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
} = useAuthSession({
  authApi,
  defaultPermissionsByRole,
  superAdminEmail: SUPER_ADMIN_EMAIL,
})
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
  reportConflict,
  productSaveBusy,
  editingProductId,
  productForm,
  productConflict,
  resetProductForm,
  updateProductFormField,
  loadReportData,
  onAddProduct,
  removeReportEntry,
  saveReport,
  retryReportSave,
  completeReport,
  resolveReportConflicts,
  discardLocalReportConflict,
  scheduleReportAutosave,
  startEditProduct,
  saveProduct,
  removeProduct,
  reloadProductConflict,
  forceProductConflict,
  clearReportState,
  cleanupReportTimers,
} = useReportState({ canManageProducts, currentUser })
const { appLoading, reportAutosaveSuppressed, fetchAppData } = useAppDataLoader({
  loadReportData,
  authMessage,
})
const {
  confirmOpen: reportCompleteConfirmOpen,
  confirmFirstTime: reportCompleteConfirmFirstTime,
  openConfirm: openReportCompleteConfirm,
  closeConfirm: closeReportCompleteConfirm,
  confirm: confirmReportComplete,
} = useReportCompletion({
  reportCanEditToday,
  reportCompleted,
  reportCompleting,
  isChef,
  completeReport,
})
const reportEditable = computed(
  () =>
    reportCanEditToday.value &&
    !isChef.value &&
    (!reportCompleted.value || userRole.value === 'admin'),
)
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
const { openScheduleAction, openScheduleRequests } = useScheduleActions({
  scheduleViewRef,
  canManageSchedule,
})

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

useAppAccessGuards({
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
})

const afterAuthenticated = async (user, { syncLocation = false } = {}) => {
  if (syncLocation) navigateTo(getTabFromLocation(), true)
  await fetchAppData()
  await maybeAskForPushPermission(user)
}

const initialize = () => restoreSession((user) => afterAuthenticated(user))
const handleSignIn = (credentials) => signIn(
  credentials,
  (user) => afterAuthenticated(user, { syncLocation: true }),
)
const handleSignUp = (credentials) => signUp(
  credentials,
  (user) => afterAuthenticated(user, { syncLocation: true }),
)

const logout = async () => {
  await endSession()
  clearRoleAdminState()
  navigateTo('main', true)
  clearReportState()
  authMessage.value = ''
  profileView.value = 'main'
  clearAssortmentPresence()
  stopAssortmentPresence()
}

watch(
  [activeTab, profileView, canManageProducts],
  () => {
    ensureAssortmentPresence()
  },
)

watch(
  dailyEntries,
  () => {
    if (reportAutosaveSuppressed.value) return
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

      <ReportSaveStatusToast
        :show="activeTab === 'main' && reportCanEditToday && Boolean(reportSaveLabel)"
        :status="reportSaveStatus"
        :label="reportSaveLabel"
        :status-class="reportSaveClass"
        @retry="retryReportSave"
      />

      <ReportConflictDialog
        :conflict="reportConflict"
        @resolve="resolveReportConflicts"
        @discard="discardLocalReportConflict"
      />
      <DataConflictDialog
        :conflict="productConflict"
        :busy="productSaveBusy"
        @reload="reloadProductConflict"
        @force="forceProductConflict"
      />

      <ReportCompletionDialog
        :open="reportCompleteConfirmOpen"
        :first-time="reportCompleteConfirmFirstTime"
        :completed="reportCompleted"
        :busy="reportCompleting"
        @close="closeReportCompleteConfirm"
        @confirm="confirmReportComplete"
      />
    </template>
  </div>
</template>
