export class ApiError extends Error {
  constructor(message, { status = 0, code = '', details = null, payload = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.payload = payload
  }
}

const withMutationMeta = (payload, meta = {}) => ({
  ...payload,
  ...(meta.operationId ? { operationId: meta.operationId } : {}),
  ...(meta.baseRevision !== undefined && meta.baseRevision !== null
    ? { baseRevision: meta.baseRevision }
    : {}),
  ...(meta.force ? { force: true } : {}),
})

export const apiRequest = async (path, options = {}) => {
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
    throw new ApiError(message, {
      status: response.status,
      code: payload?.code || '',
      details: payload?.details || null,
      payload,
    })
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
  createProduct: (payload, meta) =>
    apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(withMutationMeta(payload, meta)),
    }),
  updateProduct: (id, payload, meta) =>
    apiRequest(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(withMutationMeta(payload, meta)),
    }),
  deleteProduct: (id, meta = {}) =>
    apiRequest(`/api/products/${id}`, {
      method: 'DELETE',
      headers: {
        ...(meta.operationId ? { 'X-Operation-Id': meta.operationId } : {}),
        ...(meta.baseRevision !== undefined && meta.baseRevision !== null
          ? { 'X-Base-Revision': String(meta.baseRevision) }
          : {}),
        ...(meta.force ? { 'X-Force-Write': '1' } : {}),
      },
    }),
  report: (date = 'today') =>
    apiRequest(`/api/daily-records/${encodeURIComponent(date)}`, { method: 'GET' }),
  today: () => apiRequest('/api/daily-records/today', { method: 'GET' }),
  saveReport: (date, entries, meta = {}) =>
    apiRequest(`/api/daily-records/${encodeURIComponent(date)}`, {
      method: 'PUT',
      body: JSON.stringify(withMutationMeta({ entries, offlineReplay: meta.offlineReplay }, meta)),
    }),
  saveToday: (entries, meta) => recordsApi.saveReport('today', entries, meta),
  completeReport: (date, meta = {}) =>
    apiRequest(`/api/daily-records/${encodeURIComponent(date)}/complete`, {
      method: 'POST',
      body: JSON.stringify(withMutationMeta({ offlineReplay: meta.offlineReplay }, meta)),
    }),
  completeToday: (meta) => recordsApi.completeReport('today', meta),
  archive: ({ limitDays = 3, offsetDays = 0 } = {}) =>
    apiRequest(
      `/api/archive/records?limitDays=${limitDays}&offsetDays=${offsetDays}`,
      { method: 'GET' },
    ),
  writeOffAnalytics: ({ limitDays = 10, offsetDays = 0 } = {}) =>
    apiRequest(
      `/api/analytics/write-offs?limitDays=${limitDays}&offsetDays=${offsetDays}`,
      { method: 'GET' },
    ),
  writeOffDetails: (date) =>
    apiRequest(`/api/analytics/write-offs?date=${encodeURIComponent(date)}`, {
      method: 'GET',
    }),
  audit: ({ limit = 50, offset = 0 } = {}) =>
    apiRequest(`/api/audit?limit=${limit}&offset=${offset}`, { method: 'GET' }),
  archiveCalendar: (month) =>
    apiRequest(`/api/archive/calendar?month=${encodeURIComponent(month)}`, { method: 'GET' }),
  archiveDay: (date) =>
    apiRequest(`/api/archive/day?date=${encodeURIComponent(date)}`, { method: 'GET' }),
  archiveEmployees: ({ search = '', limit = 20, offset = 0 } = {}) =>
    apiRequest(
      `/api/archive/employees?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`,
      { method: 'GET' },
    ),
  archiveEmployee: ({ key, limit = 10, offset = 0 }) =>
    apiRequest(
      `/api/archive/employee?key=${encodeURIComponent(key)}&limit=${limit}&offset=${offset}`,
      { method: 'GET' },
    ),
  archivePeriod: ({ start, end }) =>
    apiRequest(
      `/api/archive/period?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { method: 'GET' },
    ),
}

export const employeesApi = {
  summary: (id) => apiRequest(`/api/employees/${id}/summary`, { method: 'GET' }),
}

export const shiftsApi = {
  upcoming: () => apiRequest('/api/shifts/upcoming', { method: 'GET' }),
  archive: ({ limit = 10, offset = 0 } = {}) =>
    apiRequest(`/api/shifts/archive?limit=${limit}&offset=${offset}`, { method: 'GET' }),
  assignableUsers: () => apiRequest('/api/shifts/assignable-users', { method: 'GET' }),
  template: () => apiRequest('/api/schedule-template', { method: 'GET' }),
  updateTemplate: (shifts, meta) =>
    apiRequest('/api/schedule-template', {
      method: 'PUT',
      body: JSON.stringify(withMutationMeta({ shifts }, meta)),
    }),
  requestHelp: (payload) =>
    apiRequest('/api/shifts/help-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createByAdmin: (payload, meta) =>
    apiRequest('/api/shifts/admin-create', {
      method: 'POST',
      body: JSON.stringify(withMutationMeta(payload, meta)),
    }),
  bulkSave: ({ deletedIds, newShifts }, meta) =>
    apiRequest('/api/shifts/bulk-save', {
      method: 'POST',
      body: JSON.stringify(withMutationMeta({ deletedIds, newShifts }, meta)),
    }),
  deleteWeek: (weekStart, meta = {}) =>
    apiRequest(`/api/shifts/week/${encodeURIComponent(weekStart)}`, {
      method: 'DELETE',
      headers: {
        ...(meta.operationId ? { 'X-Operation-Id': meta.operationId } : {}),
        ...(meta.baseRevision !== undefined && meta.baseRevision !== null
          ? { 'X-Base-Revision': String(meta.baseRevision) }
          : {}),
        ...(meta.force ? { 'X-Force-Write': '1' } : {}),
      },
    }),
  update: (id, payload, meta) =>
    apiRequest(`/api/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(withMutationMeta(payload, meta)),
    }),
  book: (id) => apiRequest(`/api/shifts/${id}/book`, { method: 'PATCH' }),
  assign: (id, userId) =>
    apiRequest(`/api/shifts/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ userId }),
    }),
  requestUnbook: (id) =>
    apiRequest(`/api/shifts/${id}/unbook-request`, { method: 'POST' }),
  approveUnbookRequest: (id) =>
    apiRequest(`/api/shifts/unbook-requests/${id}/approve`, { method: 'PATCH' }),
  rejectUnbookRequest: (id) =>
    apiRequest(`/api/shifts/unbook-requests/${id}/reject`, { method: 'PATCH' }),
  unbook: (id) => apiRequest(`/api/shifts/${id}/unbook`, { method: 'PATCH' }),
  approve: (id) => apiRequest(`/api/shifts/${id}/approve`, { method: 'PATCH' }),
  remove: (id) => apiRequest(`/api/shifts/${id}`, { method: 'DELETE' }),
}

export const assistantApi = {
  command: (command) =>
    apiRequest('/api/assistant/inventory', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
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
