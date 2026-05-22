<script setup>
import AssortmentEditorView from './AssortmentEditorView.vue'
import NotificationSettingsView from './NotificationSettingsView.vue'
import ProfileHomeView from './ProfileHomeView.vue'
import RoleSettingsView from './RoleSettingsView.vue'

defineProps({
  profileView: { type: String, required: true },
  userName: { type: String, required: true },
  email: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  canManageProducts: { type: Boolean, default: false },
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
  'open-roles',
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
  <div class="p-2 page-fade page-stack">
    <ProfileHomeView
      v-if="profileView === 'main'"
      :user-name="userName"
      :email="email"
      :role-label="roleLabel"
      :can-manage-products="canManageProducts"
      :can-manage-roles="canManageRoles"
      @open-assortment="emit('open-assortment')"
      @open-notifications="emit('open-notifications')"
      @open-roles="emit('open-roles')"
      @logout="emit('logout')"
    />

    <NotificationSettingsView
      v-else-if="profileView === 'notifications'"
      @back="emit('back-main')"
    />

    <AssortmentEditorView
      v-else-if="profileView === 'assortment'"
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

    <RoleSettingsView
      v-else
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
  </div>
</template>
