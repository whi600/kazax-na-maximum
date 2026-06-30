import {
  getUserPermissions,
  isSuperAdminEmail,
  isSuperAdminUser,
  mapPermissionsRow,
  requirePermission,
  requireUser,
  toBoolInt,
} from '../auth.js'
import { isEditableResource, logAudit, parseAuditJson, touchResource } from '../audit.js'
import { badRequest, forbidden, json, notFound, readJsonBody } from '../http.js'
import {
  getResourceStateStatement,
  getUserByIdStatement,
  listAuditLogStatement,
  listEditingPresenceStatement,
  listRolePermissionsStatement,
  listUsersForRoleManageStatement,
  removeEditingPresenceStatement,
  updateUserRoleStatement,
  upsertEditingPresenceStatement,
  upsertRolePermissionsStatement,
} from '../statements.js'
import { parseInteger, parseUserId } from '../api-utils.js'

const canEditResource = (resource, permissions) =>
  !(
    (resource === 'schedule' && !permissions.scheduleManage) ||
    (resource === 'assortment' && !permissions.productsManage)
  )

export const handleAdminRoutes = async ({ req, res, pathname, requestUrl, db }) => {
  if (pathname === '/api/audit' && req.method === 'GET') {
    const access = await requirePermission(req, res, 'auditView')
    if (!access) return true

    const limit = Math.max(1, Math.min(100, parseInteger(requestUrl.searchParams.get('limit'), 50)))
    const offset = Math.max(0, parseInteger(requestUrl.searchParams.get('offset'), 0))
    const rows = await listAuditLogStatement.all(limit + 1, offset)
    const pageRows = rows.slice(0, limit)
    const logs = pageRows.map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_name: row.actor_name,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      before: parseAuditJson(row.before_json),
      after: parseAuditJson(row.after_json),
      context: parseAuditJson(row.context_json),
      created_at: row.created_at,
    }))

    json(res, 200, { logs, hasMore: rows.length > limit, limit, offset })
    return true
  }

  if (pathname === '/api/editing/heartbeat' && req.method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return true

    const body = await readJsonBody(req)
    const resource = String(body.resource || '').trim()
    const active = body.active !== false

    if (!isEditableResource(resource)) {
      badRequest(res, 'Некорректный ресурс')
      return true
    }

    const permissions = await getUserPermissions(user)
    if (!canEditResource(resource, permissions)) {
      forbidden(res)
      return true
    }

    if (active) {
      await upsertEditingPresenceStatement.run(resource, user.id, user.name || user.email)
    } else {
      await removeEditingPresenceStatement.run(resource, user.id)
    }

    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/editing/touch' && req.method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return true

    const body = await readJsonBody(req)
    const resource = String(body.resource || '').trim()

    if (!isEditableResource(resource)) {
      badRequest(res, 'Некорректный ресурс')
      return true
    }

    const permissions = await getUserPermissions(user)
    if (!canEditResource(resource, permissions)) {
      forbidden(res)
      return true
    }

    await touchResource(resource, user)
    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/editing/status' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const resource = String(requestUrl.searchParams.get('resource') || '').trim()
    if (!isEditableResource(resource)) {
      badRequest(res, 'Некорректный ресурс')
      return true
    }

    const permissions = await getUserPermissions(user)
    if (!canEditResource(resource, permissions)) {
      forbidden(res)
      return true
    }

    const activeEditors = (await listEditingPresenceStatement.all(resource))
      .filter((row) => row.user_id !== user.id)
      .map((row) => ({
        user_id: row.user_id,
        user_name: row.user_name,
        updated_at: row.updated_at,
      }))

    const state = await getResourceStateStatement.get(resource)
    json(res, 200, {
      activeEditors,
      lastChangedAt: state?.last_changed_at || null,
      lastChangedBy: state?.last_changed_by || null,
    })
    return true
  }

  if (pathname === '/api/roles/permissions' && req.method === 'GET') {
    const access = await requirePermission(req, res, 'rolesManage')
    if (!access) return true

    const rows = await listRolePermissionsStatement.all()
    const roles = rows.map((row) => ({
      role: row.role,
      permissions: mapPermissionsRow(row),
    }))

    json(res, 200, { roles })
    return true
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    const access = await requirePermission(req, res, 'rolesManage')
    if (!access) return true

    const users = (await listUsersForRoleManageStatement.all()).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.created_at,
      isSuperAdmin: isSuperAdminEmail(row.email),
    }))

    json(res, 200, { users })
    return true
  }

  const userRoleTargetId = parseUserId(pathname)
  if (userRoleTargetId && req.method === 'PUT') {
    const access = await requirePermission(req, res, 'rolesManage')
    if (!access) return true
    const { user: actorUser } = access

    const targetUser = await getUserByIdStatement.get(userRoleTargetId)
    if (!targetUser) {
      notFound(res, 'Пользователь не найден')
      return true
    }

    const body = await readJsonBody(req)
    const rawRole = String(body.role || '')
      .trim()
      .toLowerCase()
    const allowedRoles = new Set(['employee', 'chef', 'admin'])
    if (!allowedRoles.has(rawRole)) {
      badRequest(res, 'Недопустимая роль')
      return true
    }
    const nextRole = rawRole

    const actorIsSuper = isSuperAdminUser(actorUser)
    const targetIsSuper = isSuperAdminEmail(targetUser.email)

    if (!actorIsSuper && targetIsSuper) {
      forbidden(res, 'Роль супер-админа может менять только супер-админ')
      return true
    }

    if (!actorIsSuper && targetUser.role === 'admin') {
      forbidden(res, 'Только супер-админ может менять роль у администраторов')
      return true
    }

    if (targetIsSuper) {
      badRequest(res, 'Роль супер-админа нельзя изменить')
      return true
    }

    await updateUserRoleStatement.run(nextRole, userRoleTargetId)
    const updatedUser = await getUserByIdStatement.get(userRoleTargetId)

    await logAudit({
      actorUser,
      entityType: 'user',
      entityId: userRoleTargetId,
      action: 'user.role_update',
      before: { role: targetUser.role, email: targetUser.email, name: targetUser.name },
      after: { role: updatedUser.role, email: updatedUser.email, name: updatedUser.name },
    })

    json(res, 200, {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        created_at: updatedUser.created_at,
        isSuperAdmin: isSuperAdminEmail(updatedUser.email),
      },
    })
    return true
  }

  if (pathname === '/api/roles/permissions' && req.method === 'PUT') {
    const access = await requirePermission(req, res, 'rolesManage')
    if (!access) return true

    const body = await readJsonBody(req)
    const roles = Array.isArray(body.roles) ? body.roles : []
    const allowedRoles = new Set(['chef', 'employee'])

    await db.transaction(async (client) => {
      for (const item of roles) {
        const role = String(item?.role || '')
        if (!allowedRoles.has(role)) continue
        const permissions = item.permissions || {}

        await upsertRolePermissionsStatement.runOn(
          client,
          role,
          toBoolInt(permissions.reportEdit),
          toBoolInt(permissions.productsManage),
          toBoolInt(permissions.scheduleManage),
          toBoolInt(permissions.auditView),
          toBoolInt(permissions.rolesManage),
        )
      }
    })

    const rows = await listRolePermissionsStatement.all()
    const responseRoles = rows.map((row) => ({
      role: row.role,
      permissions: mapPermissionsRow(row),
    }))

    json(res, 200, { roles: responseRoles })
    return true
  }

  return false
}
