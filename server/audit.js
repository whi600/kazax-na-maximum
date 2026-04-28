import {
  insertAuditLogStatement,
  upsertResourceStateStatement,
} from './statements.js'

const editableResources = new Set(['schedule', 'assortment'])

const toAuditPayload = (value) => {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export const parseAuditJson = (value) => {
  if (!value) return null
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const logAudit = async ({
  actorUser,
  entityType,
  entityId = null,
  action,
  before = null,
  after = null,
  context = null,
}) => {
  if (!actorUser?.id || !action || !entityType) return

  await insertAuditLogStatement.run(
    actorUser.id,
    actorUser.name || actorUser.email || 'system',
    String(entityType),
    entityId === null || entityId === undefined ? null : String(entityId),
    String(action),
    toAuditPayload(before),
    toAuditPayload(after),
    toAuditPayload(context),
  )
}

export const touchResource = async (resource, actorUser) => {
  if (!editableResources.has(resource)) return
  await upsertResourceStateStatement.run(resource, actorUser?.name || actorUser?.email || 'system')
}
