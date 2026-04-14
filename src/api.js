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
  today: () => apiRequest('/api/daily-records/today', { method: 'GET' }),
  saveToday: (entries) =>
    apiRequest('/api/daily-records/today', {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),
  archive: () => apiRequest('/api/archive/records', { method: 'GET' }),
}

export const shiftsApi = {
  upcoming: () => apiRequest('/api/shifts/upcoming', { method: 'GET' }),
  archive: () => apiRequest('/api/shifts/archive', { method: 'GET' }),
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
  book: (id) => apiRequest(`/api/shifts/${id}/book`, { method: 'PATCH' }),
  unbook: (id) => apiRequest(`/api/shifts/${id}/unbook`, { method: 'PATCH' }),
  approve: (id) => apiRequest(`/api/shifts/${id}/approve`, { method: 'PATCH' }),
  remove: (id) => apiRequest(`/api/shifts/${id}`, { method: 'DELETE' }),
  setPaid: (id, isPaid) =>
    apiRequest(`/api/shifts/${id}/paid`, {
      method: 'PATCH',
      body: JSON.stringify({ is_paid: Boolean(isPaid) }),
    }),
}
