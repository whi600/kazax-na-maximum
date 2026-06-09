const apiRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`
    throw new Error(message)
  }

  return payload
}

export const authApi = {
  me: () => apiRequest('/api/auth/me', { method: 'GET' }),
  permissions: () => apiRequest('/api/auth/permissions', { method: 'GET' }),
  rolePermissions: () => apiRequest('/api/roles/permissions', { method: 'GET' }),
  updateRolePermissions: (roles) =>
    apiRequest('/api/roles/permissions', {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    }),
  users: () => apiRequest('/api/users', { method: 'GET' }),
  updateUserRole: (id, role) =>
    apiRequest(`/api/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  login: (email, password) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: ({ email, password, displayName }) =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
}

export const recordsApi = {
  products: () => apiRequest('/api/products', { method: 'GET' }),
  createProduct: (payload) =>
    apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProduct: (id, payload) =>
    apiRequest(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id) => apiRequest(`/api/products/${id}`, { method: 'DELETE' }),
  today: () => apiRequest('/api/daily-records/today', { method: 'GET' }),
  saveToday: (entries) =>
    apiRequest('/api/daily-records/today', {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),
  archive: () => apiRequest('/api/archive/records', { method: 'GET' }),
  audit: ({ limit = 50, offset = 0 } = {}) =>
    apiRequest(`/api/audit?limit=${limit}&offset=${offset}`, { method: 'GET' }),
}

export const shiftsApi = {
  upcoming: () => apiRequest('/api/shifts/upcoming', { method: 'GET' }),
  archive: () => apiRequest('/api/shifts/archive', { method: 'GET' }),
  assignableUsers: () => apiRequest('/api/shifts/assignable-users', { method: 'GET' }),
  template: () => apiRequest('/api/schedule-template', { method: 'GET' }),
  updateTemplate: (shifts) =>
    apiRequest('/api/schedule-template', {
      method: 'PUT',
      body: JSON.stringify({ shifts }),
    }),
  requestHelp: (payload) =>
    apiRequest('/api/shifts/help-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createByAdmin: (payload) =>
    apiRequest('/api/shifts/admin-create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bulkSave: ({ deletedIds, newShifts }) =>
    apiRequest('/api/shifts/bulk-save', {
      method: 'POST',
      body: JSON.stringify({ deletedIds, newShifts }),
    }),
  deleteWeek: (weekStart) =>
    apiRequest(`/api/shifts/week/${encodeURIComponent(weekStart)}`, {
      method: 'DELETE',
    }),
  update: (id, payload) =>
    apiRequest(`/api/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  book: (id) => apiRequest(`/api/shifts/${id}/book`, { method: 'PATCH' }),
  assign: (id, userId) =>
    apiRequest(`/api/shifts/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ userId }),
    }),
  unbook: (id) => apiRequest(`/api/shifts/${id}/unbook`, { method: 'PATCH' }),
  approve: (id) => apiRequest(`/api/shifts/${id}/approve`, { method: 'PATCH' }),
  remove: (id) => apiRequest(`/api/shifts/${id}`, { method: 'DELETE' }),
}

export const editingApi = {
  heartbeat: ({ resource, active = true }) =>
    apiRequest('/api/editing/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ resource, active }),
    }),
  status: (resource) =>
    apiRequest(`/api/editing/status?resource=${encodeURIComponent(resource)}`, {
      method: 'GET',
    }),
  touch: (resource) =>
    apiRequest('/api/editing/touch', {
      method: 'POST',
      body: JSON.stringify({ resource }),
  }),
}

export const notificationsApi = {
  settings: () => apiRequest('/api/notifications/settings', { method: 'GET' }),
  updateSettings: (payload) =>
    apiRequest('/api/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  subscribe: (payload) =>
    apiRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unsubscribe: (endpoint) =>
    apiRequest('/api/notifications/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
  test: () => apiRequest('/api/notifications/test', { method: 'POST' }),
  broadcast: (payload) =>
    apiRequest('/api/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
