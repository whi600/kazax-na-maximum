import { createHash } from 'node:crypto'
import { conflictError, HttpError } from '../errors.js'
import {
  getOperationResultStatement,
  getResourceStateStatement,
  insertOperationResultStatement,
  upsertResourceStateStatement,
} from '../statements.js'

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalize(value[key])
      return result
    }, {})
}

const hashPayload = (payload) =>
  createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')

const parseOptionalRevision = (value) => {
  if (value === undefined || value === null || value === '') return null
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new HttpError(400, 'Некорректная версия данных', 'INVALID_REVISION')
  }
  return revision
}

export const parseMutationMeta = (req, body = {}) => {
  const operationId = String(
    body.operationId || req.headers['x-operation-id'] || '',
  ).trim()
  if (operationId && (operationId.length < 8 || operationId.length > 128)) {
    throw new HttpError(400, 'Некорректный идентификатор операции', 'INVALID_OPERATION_ID')
  }

  return {
    operationId: operationId || null,
    baseRevision: parseOptionalRevision(
      body.baseRevision ?? req.headers['x-base-revision'],
    ),
    force: body.force === true || req.headers['x-force-write'] === '1',
  }
}

const parseStoredResponse = (value) => {
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const getResourceRevision = async (resource, client = null) => {
  const state = client
    ? await getResourceStateStatement.getOn(client, resource)
    : await getResourceStateStatement.get(resource)
  return Number(state?.revision || 0)
}

export const withResourceMutation = async ({ database, user, resource, execute }) =>
  database.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `resource:${resource}`,
    ])
    const value = await execute(client)
    const state = await upsertResourceStateStatement.getOn(
      client,
      resource,
      user.name || user.email || 'system',
    )
    return { value, revision: Number(state?.revision || 0) }
  })

export const withVersionedMutation = async ({
  database,
  user,
  resource,
  meta,
  payload,
  execute,
}) => {
  const requestHash = hashPayload(payload)

  return database.transaction(async (client) => {
    // Serialize mutations of one logical resource so revision checking and writing
    // remain one atomic decision even under concurrent PostgreSQL transactions.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `resource:${resource}`,
    ])
    if (meta.operationId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [meta.operationId])
      const stored = await getOperationResultStatement.getOn(client, meta.operationId)
      if (stored) {
        if (
          Number(stored.user_id) !== Number(user.id) ||
          stored.resource !== resource ||
          stored.request_hash !== requestHash
        ) {
          throw conflictError(
            'Идентификатор операции уже использован для другого изменения',
            'OPERATION_ID_REUSED',
          )
        }

        return {
          statusCode: Number(stored.status_code),
          payload: parseStoredResponse(stored.response_json),
          replayed: true,
        }
      }
    }

    const currentRevision = await getResourceRevision(resource, client)
    if (
      meta.baseRevision !== null &&
      meta.baseRevision !== currentRevision &&
      !meta.force
    ) {
      throw conflictError(
        'Данные уже изменились на другом устройстве',
        'REVISION_CONFLICT',
        { resource, baseRevision: meta.baseRevision, currentRevision },
      )
    }

    const result = await execute(client, { currentRevision })
    const changedBy = user.name || user.email || 'system'
    const state = await upsertResourceStateStatement.getOn(client, resource, changedBy)
    const response = {
      ...(result.payload || {}),
      revision: Number(state?.revision || currentRevision + 1),
    }
    const statusCode = Number(result.statusCode || 200)

    if (meta.operationId) {
      await insertOperationResultStatement.runOn(
        client,
        meta.operationId,
        user.id,
        resource,
        requestHash,
        statusCode,
        JSON.stringify(response),
      )
    }

    return {
      statusCode,
      payload: response,
      replayed: false,
      forced: meta.force && meta.baseRevision !== null && meta.baseRevision !== currentRevision,
    }
  })
}
