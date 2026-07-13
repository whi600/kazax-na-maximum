import { logAudit } from '../audit.js'
import { requirePermission, requireUser } from '../auth.js'
import { HttpError } from '../errors.js'
import { badRequest, json, readJsonBody } from '../http.js'
import { normalizeProductCategory, parseProductId } from '../api-utils.js'
import {
  deleteProductStatement,
  getProductByIdStatement,
  insertProductStatement,
  listProductsStatement,
  updateProductStatement,
} from '../statements.js'
import {
  getResourceRevision,
  parseMutationMeta,
  withVersionedMutation,
} from '../services/mutation-service.js'

const RESOURCE = 'assortment'

const validateProduct = (body, { defaultUnit = false } = {}) => {
  const name = String(body.name || '').trim()
  const unit = String(body.unit || (defaultUnit ? 'шт' : '')).trim()
  const category = normalizeProductCategory(body.category)
  if (!name) return { error: 'Укажите название товара' }
  if (!unit) return { error: 'Укажите единицу измерения' }
  return { name, unit, category }
}

export const handleProductRoutes = async ({ req, res, pathname, db }) => {
  if (pathname === '/api/products' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    json(res, 200, {
      products: await listProductsStatement.all(),
      revision: await getResourceRevision(RESOURCE),
    })
    return true
  }

  const productId = parseProductId(pathname)
  const isCreate = pathname === '/api/products' && req.method === 'POST'
  const isUpdate = Boolean(productId) && req.method === 'PATCH'
  const isDelete = Boolean(productId) && req.method === 'DELETE'
  if (!isCreate && !isUpdate && !isDelete) return false

  const access = await requirePermission(req, res, 'productsManage')
  if (!access) return true
  const { user } = access
  const body = isDelete ? {} : await readJsonBody(req)
  const meta = parseMutationMeta(req, body)
  const productData = isDelete ? null : validateProduct(body, { defaultUnit: isCreate })
  if (productData?.error) {
    badRequest(res, productData.error)
    return true
  }

  const result = await withVersionedMutation({
    database: db,
    user,
    resource: RESOURCE,
    meta,
    payload: { action: isCreate ? 'create' : isUpdate ? 'update' : 'delete', productId, productData },
    execute: async (client, { currentRevision }) => {
      const forced = meta.force && meta.baseRevision !== null && meta.baseRevision !== currentRevision
      if (isCreate) {
        const inserted = await insertProductStatement.runOn(
          client,
          productData.name,
          productData.category,
          productData.unit,
        )
        const product = await getProductByIdStatement.getOn(client, Number(inserted.lastInsertRowid))
        await logAudit({
          actorUser: user,
          entityType: 'product',
          entityId: product.id,
          action: 'product.create',
          after: product,
          context: forced ? { conflictResolution: 'force' } : null,
          client,
        })
        return { statusCode: 201, payload: { product } }
      }

      const existing = await getProductByIdStatement.getOn(client, productId)
      if (!existing) throw new HttpError(404, 'Товар не найден', 'PRODUCT_NOT_FOUND')

      if (isUpdate) {
        await updateProductStatement.runOn(
          client,
          productData.name,
          productData.category,
          productData.unit,
          productId,
        )
        const product = await getProductByIdStatement.getOn(client, productId)
        await logAudit({
          actorUser: user,
          entityType: 'product',
          entityId: productId,
          action: 'product.update',
          before: existing,
          after: product,
          context: forced ? { conflictResolution: 'force' } : null,
          client,
        })
        return { payload: { product } }
      }

      await deleteProductStatement.runOn(client, productId)
      await logAudit({
        actorUser: user,
        entityType: 'product',
        entityId: productId,
        action: 'product.delete',
        before: existing,
        context: forced ? { conflictResolution: 'force' } : null,
        client,
      })
      return { payload: { ok: true } }
    },
  })

  json(res, result.statusCode, result.payload)
  return true
}
