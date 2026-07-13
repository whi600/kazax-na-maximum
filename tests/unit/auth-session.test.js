import { describe, expect, it, vi } from 'vitest'
import { useAuthSession } from '../../src/app/useAuthSession.js'

const permissionsFor = (role) => ({
  reportEdit: true,
  productsManage: role === 'admin',
  scheduleManage: role === 'admin',
  auditView: role === 'admin',
  rolesManage: role === 'admin',
})

describe('auth session', () => {
  it('loads permissions and runs initial data loading after sign in', async () => {
    const user = { id: 4, email: 'admin@example.test', name: 'Admin', role: 'admin' }
    const authApi = {
      login: vi.fn().mockResolvedValue({ user }),
      permissions: vi.fn().mockResolvedValue({
        permissions: permissionsFor('admin'),
        isSuperAdmin: false,
      }),
    }
    const session = useAuthSession({
      authApi,
      defaultPermissionsByRole: permissionsFor,
      superAdminEmail: 'owner@example.test',
    })
    const afterAuthenticated = vi.fn().mockResolvedValue(undefined)

    await session.signIn(
      { email: user.email, password: 'secret' },
      afterAuthenticated,
    )

    expect(authApi.login).toHaveBeenCalledWith(user.email, 'secret')
    expect(authApi.permissions).toHaveBeenCalledOnce()
    expect(afterAuthenticated).toHaveBeenCalledWith(user)
    expect(session.currentUser.value).toEqual(user)
    expect(session.canManageSchedule.value).toBe(true)
    expect(session.authMessage.value).toBe('')
  })
})
