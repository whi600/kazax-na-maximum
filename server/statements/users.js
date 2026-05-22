import { db } from '../db.js'

export const getUsersCountStatement = db.prepare('SELECT COUNT(*)::int AS count FROM users')

export const getUserByEmailStatement = db.prepare('SELECT * FROM users WHERE email = ?')

export const getUserByIdStatement = db.prepare(
  'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
)

export const getUserByNameStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`)

export const listUsersForRoleManageStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  ORDER BY created_at DESC, id DESC
`)

export const listUsersWithScheduleManageStatement = db.prepare(`
  SELECT u.id, u.email, u.name, u.role, u.created_at
  FROM users u
  JOIN role_permissions rp ON rp.role = u.role
  WHERE rp.schedule_manage = 1
  ORDER BY u.created_at DESC, u.id DESC
`)

export const listEmployeeUsersStatement = db.prepare(`
  SELECT id, email, name, role, created_at
  FROM users
  WHERE role = 'employee'
  ORDER BY created_at DESC, id DESC
`)

export const updateUserRoleStatement = db.prepare(
  "UPDATE users SET role = ? WHERE id = ?",
)

export const createUserStatement = db.prepare(
  'INSERT INTO users(email, password_hash, name, role) VALUES (?, ?, ?, ?) RETURNING id',
)

export const createSessionStatement = db.prepare(
  'INSERT INTO sessions(id, user_id, expires_at) VALUES (?, ?, ?)',
)

export const getSessionUserStatement = db.prepare(`
  SELECT
    s.id AS session_id,
    s.expires_at AS expires_at,
    u.id AS id,
    u.email AS email,
    u.name AS name,
    u.role AS role,
    u.created_at AS created_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`)

export const deleteSessionStatement = db.prepare('DELETE FROM sessions WHERE id = ?')

export const deleteExpiredSessionsStatement = db.prepare(
  "DELETE FROM sessions WHERE expires_at <= datetime('now')",
)

export const getRolePermissionsStatement = db.prepare(`
  SELECT
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage
  FROM role_permissions
  WHERE role = ?
`)

export const listRolePermissionsStatement = db.prepare(`
  SELECT
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage
  FROM role_permissions
  ORDER BY role
`)

export const upsertRolePermissionsStatement = db.prepare(`
  INSERT INTO role_permissions(
    role,
    report_edit,
    products_manage,
    schedule_manage,
    audit_view,
    roles_manage,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(role)
  DO UPDATE SET
    report_edit = excluded.report_edit,
    products_manage = excluded.products_manage,
    schedule_manage = excluded.schedule_manage,
    audit_view = excluded.audit_view,
    roles_manage = excluded.roles_manage,
    updated_at = datetime('now')
`)
