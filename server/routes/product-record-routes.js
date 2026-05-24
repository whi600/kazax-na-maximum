import { requirePermission, requireUser } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
import { badRequest, json, notFound, readJsonBody } from '../http.js'
import {
  deleteProductStatement,
  deleteTodayRecordsStatement,
  getProductByIdStatement,
  insertDailyRecordStatement,
  insertProductStatement,
  listArchiveRecordsStatement,
  listProductsStatement,
  listTodayRecordsStatement,
  updateProductStatement,
} from '../statements.js'
import {
  getRetentionStartDate,
  getToday,
  normalizeProductCategory,
  parseProductId,
} from '../api-utils.js'

const REPORT_ARCHIVE_DAYS = 10

export const handleProductRecordRoutes = async ({ req, res, pathname, db }) => {
  if (pathname === '/api/products' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const products = await listProductsStatement.all()
    json(res, 200, { products })
    return true
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    const access = await requirePermission(req, res, 'productsManage')
    if (!access) return true
    const { user } = access

    const body = await readJsonBody(req)
    const name = String(body.name || '').trim()
    const unit = String(body.unit || 'шт').trim() || 'шт'
    const category = normalizeProductCategory(body.category)

    if (!name) {
      badRequest(res, 'Укажите название товара')
      return true
    }

    const result = await insertProductStatement.run(name, category, unit)
    const product = await getProductByIdStatement.get(Number(result.lastInsertRowid))
    await touchResource('assortment', user)
    await logAudit({
      actorUser: user,
      entityType: 'product',
      entityId: product?.id,
      action: 'product.create',
      after: product,
    })
    json(res, 201, { product })
    return true
  }

  const productId = parseProductId(pathname)
  if (productId && req.method === 'PATCH') {
    const access = await requirePermission(req, res, 'productsManage')
    if (!access) return true
    const { user } = access

    const existing = await getProductByIdStatement.get(productId)
    if (!existing) {
      notFound(res, 'Товар не найден')
      return true
    }

    const body = await readJsonBody(req)
    const name = String(body.name || '').trim()
    const unit = String(body.unit || '').trim()
    const category = normalizeProductCategory(body.category)

    if (!name) {
      badRequest(res, 'Укажите название товара')
      return true
    }
    if (!unit) {
      badRequest(res, 'Укажите единицу измерения')
      return true
    }

    await updateProductStatement.run(name, category, unit, productId)
    const product = await getProductByIdStatement.get(productId)
    await touchResource('assortment', user)
    await logAudit({
      actorUser: user,
      entityType: 'product',
      entityId: productId,
      action: 'product.update',
      before: existing,
      after: product,
    })
    json(res, 200, { product })
    return true
  }

  if (productId && req.method === 'DELETE') {
    const access = await requirePermission(req, res, 'productsManage')
    if (!access) return true
    const { user } = access

    const existing = await getProductByIdStatement.get(productId)
    if (!existing) {
      notFound(res, 'Товар не найден')
      return true
    }

    await deleteProductStatement.run(productId)
    await touchResource('assortment', user)
    await logAudit({
      actorUser: user,
      entityType: 'product',
      entityId: productId,
      action: 'product.delete',
      before: existing,
    })
    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/daily-records/today' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const rows = await listTodayRecordsStatement.all(getToday())
    const entries = rows.map((row) => ({
      product_id: row.product_id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      arrival: row.arrival,
      remainder: row.remainder,
      write_off: row.write_off,
    }))

    json(res, 200, { entries })
    return true
  }

  if (pathname === '/api/daily-records/today' && req.method === 'PUT') {
    const access = await requirePermission(req, res, 'reportEdit')
    if (!access) return true
    const { user } = access

    const body = await readJsonBody(req)
    const entries = Array.isArray(body.entries) ? body.entries : []
    const today = getToday()

    await db.transaction(async (client) => {
      await deleteTodayRecordsStatement.runOn(client, today)

      for (const item of entries) {
        const productId = Number(item.product_id)
        if (!Number.isFinite(productId)) continue

        const arrival = Number(item.arrival || 0)
        const remainder = Number(item.remainder || 0)
        const writeOff = Number(item.write_off || 0)
        const normalizedArrival = Number.isFinite(arrival) ? arrival : 0
        const normalizedRemainder = Number.isFinite(remainder) ? remainder : 0
        const normalizedWriteOff = Number.isFinite(writeOff) ? writeOff : 0

        if (
          normalizedArrival === 0 &&
          normalizedRemainder === 0 &&
          normalizedWriteOff === 0
        ) {
          continue
        }

        await insertDailyRecordStatement.runOn(
          client,
          today,
          normalizedArrival,
          normalizedRemainder,
          normalizedWriteOff,
          user.id,
          productId,
        )
      }
    })

    json(res, 200, { ok: true })
    return true
  }

  if (pathname === '/api/archive/records' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const retentionStartDate = getRetentionStartDate(REPORT_ARCHIVE_DAYS)
    const rows = await listArchiveRecordsStatement.all(retentionStartDate)
    const records = rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      arrival: row.arrival,
      remainder: row.remainder,
      write_off: row.write_off,
      created_at: row.record_date,
      products: {
        name: row.product_name,
        category: row.product_category,
      },
    }))

    json(res, 200, { records })
    return true
  }

  return false
}
