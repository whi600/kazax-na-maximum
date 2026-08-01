import {
  insertAuditLogStatement,
  upsertResourceStateStatement,
} from './statements.js'
import { db } from './db.js'

const editableResources = new Set(['schedule', 'assortment', 'calendar'])

export const isEditableResource = (resource) => editableResources.has(resource)

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
  client = null,
}) => {
  if (!actorUser?.id || !action || !entityType) return

  const method = client ? 'runOn' : 'run'
  const args = [
    actorUser.id,
    actorUser.name || actorUser.email || 'system',
    String(entityType),
    entityId === null || entityId === undefined ? null : String(entityId),
    String(action),
    toAuditPayload(before),
    toAuditPayload(after),
    toAuditPayload(context),
  ]
  await insertAuditLogStatement[method](...(client ? [client, ...args] : args))
}

export const touchResource = async (resource, actorUser) => {
  if (!isEditableResource(resource)) return
  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `resource:${resource}`,
    ])
    return upsertResourceStateStatement.getOn(
      client,
      resource,
      actorUser?.name || actorUser?.email || 'system',
    )
  })
}
