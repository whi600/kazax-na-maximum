import { db } from '../db.js'

export const getOperationResultStatement = db.prepare(`
  SELECT operation_id, user_id, resource, request_hash, status_code, response_json, created_at
  FROM operation_results
  WHERE operation_id = ?
`)

export const insertOperationResultStatement = db.prepare(`
  INSERT INTO operation_results(
    operation_id,
    user_id,
    resource,
    request_hash,
    status_code,
    response_json
  )
  VALUES (?, ?, ?, ?, ?, ?::jsonb)
`)
