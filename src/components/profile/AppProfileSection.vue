<script setup>
import AssortmentEditorView from './AssortmentEditorView.vue'
import AuditLogView from './AuditLogView.vue'
import BroadcastNotificationView from './BroadcastNotificationView.vue'
import EmployeeProfilesView from './EmployeeProfilesView.vue'
import NotificationSettingsView from './NotificationSettingsView.vue'
import ProfileHomeView from './ProfileHomeView.vue'
import RoleSettingsView from './RoleSettingsView.vue'
import ScheduleTemplateEditorView from './ScheduleTemplateEditorView.vue'

defineProps({
  profileView: { type: String, required: true },
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  canManageProducts: { type: Boolean, default: false },
  canManageSchedule: { type: Boolean, default: false },
  canManageRoles: { type: Boolean, default: false },
  products: { type: Array, default: () => [] },
  productForm: { type: Object, required: true },
  editingProductId: { type: [Number, String, null], default: null },
  productSaveBusy: { type: Boolean, default: false },
  assortmentEditorsLabel: { type: String, default: '' },
  assortmentLastChangedLabel: { type: String, default: '' },
  rolePermissions: { type: Array, default: () => [] },
  permissionRows: { type: Array, default: () => [] },
  roleUsers: { type: Array, default: () => [] },
  roleLabels: { type: Object, required: true },
  roleSettingsBusy: { type: Boolean, default: false },
  roleUsersLoading: { type: Boolean, default: false },
  roleUserUpdatingId: { type: [Number, String, null], default: null },
  currentUserId: { type: [Number, String, null], default: null },
  isSuperAdmin: { type: Boolean, default: false },
  superAdminEmail: { type: String, required: true },
})

const emit = defineEmits([
  'open-assortment',
  'open-notifications',
  'open-schedule-template',
  'open-employees',
  'open-roles',
  'open-audit',
  'open-broadcast',
  'logout',
  'back-main',
  'update-product-field',
  'save-product',
  'reset-product',
  'edit-product',
  'remove-product',
  'toggle-permission',
  'save-permissions',
  'refresh-users',
  'update-user-role',
  'change-user-role',
])
</script>

<template>
  <div class="p-2">
    <Transition name="profile-view" mode="out-in">
      <ProfileHomeView
        v-if="profileView === 'main'"
        key="main"
        :user-name="userName"
        :email="email"
        :role-label="roleLabel"
        :can-manage-products="canManageProducts"
        :can-manage-schedule="canManageSchedule"
        :can-manage-roles="canManageRoles"
        :is-super-admin="isSuperAdmin"
        @open-assortment="emit('open-assortment')"
        @open-notifications="emit('open-notifications')"
        @open-schedule-template="emit('open-schedule-template')"
        @open-employees="emit('open-employees')"
        @open-roles="emit('open-roles')"
        @open-audit="emit('open-audit')"
        @open-broadcast="emit('open-broadcast')"
        @logout="emit('logout')"
      />

      <BroadcastNotificationView
        v-else-if="profileView === 'broadcast'"
        key="broadcast"
        @back="emit('back-main')"
      />

      <NotificationSettingsView
        v-else-if="profileView === 'notifications'"
        key="notifications"
        @back="emit('back-main')"
      />

      <AssortmentEditorView
        v-else-if="profileView === 'assortment'"
        key="assortment"
        :products="products"
        :form="productForm"
        :editing-product-id="editingProductId"
        :busy="productSaveBusy"
        :editors-label="assortmentEditorsLabel"
        :last-changed-label="assortmentLastChangedLabel"
        @back="emit('back-main')"
        @update-field="(...args) => emit('update-product-field', ...args)"
        @save="emit('save-product')"
        @reset="emit('reset-product')"
        @edit-product="emit('edit-product', $event)"
        @remove-product="emit('remove-product', $event)"
      />

      <ScheduleTemplateEditorView
        v-else-if="profileView === 'schedule-template'"
        key="schedule-template"
        @back="emit('back-main')"
      />

      <EmployeeProfilesView
        v-else-if="profileView === 'employees'"
        key="employees"
        @back="emit('back-main')"
      />

      <AuditLogView
        v-else-if="profileView === 'audit'"
        key="audit"
        @back="emit('back-main')"
      />

      <RoleSettingsView
        v-else
        key="roles"
        :role-permissions="rolePermissions"
        :permission-rows="permissionRows"
        :role-users="roleUsers"
        :role-labels="roleLabels"
        :role-settings-busy="roleSettingsBusy"
        :role-users-loading="roleUsersLoading"
        :role-user-updating-id="roleUserUpdatingId"
        :current-user-id="currentUserId"
        :is-super-admin="isSuperAdmin"
        :super-admin-email="superAdminEmail"
        @back="emit('back-main')"
        @toggle-permission="(...args) => emit('toggle-permission', ...args)"
        @save-permissions="emit('save-permissions')"
        @refresh-users="emit('refresh-users')"
        @update-user-role="(...args) => emit('update-user-role', ...args)"
        @change-user-role="emit('change-user-role', $event)"
      />
    </Transition>
  </div>
</template>

<style scoped>
.profile-view-enter-active,
.profile-view-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.profile-view-enter-from,
.profile-view-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
