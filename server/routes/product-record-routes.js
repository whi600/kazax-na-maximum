import { requirePermission, requireUser } from '../auth.js'
import { logAudit, touchResource } from '../audit.js'
import { badRequest, forbidden, json, notFound, readJsonBody } from '../http.js'
import {
  deleteProductStatement,
  deleteDailyReportStatusStatement,
  deleteTodayRecordsStatement,
  countArchiveRecordDaysStatement,
  getDailyReportStatusStatement,
  getApprovedShiftForUserDateStatement,
  getProductByIdStatement,
  insertDailyRecordStatement,
  insertProductStatement,
  listArchiveRecordsPageStatement,
  listWriteOffDetailsByDateStatement,
  listWriteOffTotalsStatement,
  listProductsStatement,
  listTodayRecordsStatement,
  upsertDailyReportStatusStatement,
  updateProductStatement,
} from '../statements.js'
import {
  getRetentionStartDate,
  getToday,
  normalizeProductCategory,
  parseInteger,
  parseProductId,
} from '../api-utils.js'

const REPORT_ARCHIVE_DAYS = 10

const mapReportStatus = (row) => ({
  completed: Boolean(row?.completed_at),
  completedAt: row?.completed_at || null,
  completedByName: row?.completed_by_name || null,
})

const canEditDailyReport = async (user, date) => {
  if (user?.role === 'admin') return true
  if (!user?.name) return false

  const shift = await getApprovedShiftForUserDateStatement.get(date, user.name)
  return Boolean(shift)
}

export const handleProductRecordRoutes = async ({ req, res, pathname, requestUrl, db }) => {
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

    const today = getToday()
    const rows = await listTodayRecordsStatement.all(today)
    const entries = rows.map((row) => ({
      product_id: row.product_id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      arrival: row.arrival,
      remainder: row.remainder,
      write_off: row.write_off,
    }))

    json(res, 200, {
      entries,
      canEdit: await canEditDailyReport(user, today),
      reportStatus: mapReportStatus(await getDailyReportStatusStatement.get(today)),
    })
    return true
  }

  if (pathname === '/api/daily-records/today/complete' && req.method === 'POST') {
    const user = await requireUser(req, res)
    if (!user) return true

    const today = getToday()
    if (!(await canEditDailyReport(user, today))) {
      forbidden(res, 'Отметить отчет готовым может только админ или сотрудник со сменой сегодня')
      return true
    }

    await upsertDailyReportStatusStatement.run(today, user.id)
    await touchResource('report', user)
    await logAudit({
      actorUser: user,
      entityType: 'daily_report',
      entityId: today,
      action: 'daily_report.complete',
      after: { record_date: today, completed_by_user_id: user.id },
    })

    json(res, 200, {
      ok: true,
      reportStatus: mapReportStatus(await getDailyReportStatusStatement.get(today)),
    })
    return true
  }

  if (pathname === '/api/daily-records/today' && req.method === 'PUT') {
    const user = await requireUser(req, res)
    if (!user) return true

    const body = await readJsonBody(req)
    const entries = Array.isArray(body.entries) ? body.entries : []
    const today = getToday()

    if (!(await canEditDailyReport(user, today))) {
      forbidden(res, 'Редактировать отчет может только админ или сотрудник со сменой сегодня')
      return true
    }

    await db.transaction(async (client) => {
      await deleteTodayRecordsStatement.runOn(client, today)
      await deleteDailyReportStatusStatement.runOn(client, today)

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

  if (pathname === '/api/analytics/write-offs' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const detailDate = String(requestUrl.searchParams.get('date') || '').trim()
    if (detailDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(detailDate)) {
        badRequest(res, 'Некорректная дата')
        return true
      }

      const rows = await listWriteOffDetailsByDateStatement.all(detailDate)
      json(res, 200, {
        date: detailDate,
        items: rows.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          product_name: row.product_name,
          product_category: row.product_category,
          product_unit: row.product_unit,
          write_off: row.write_off,
        })),
      })
      return true
    }

    const limitDays = Math.max(
      1,
      Math.min(30, parseInteger(requestUrl.searchParams.get('limitDays'), REPORT_ARCHIVE_DAYS)),
    )
    const retentionStartDate = getRetentionStartDate(limitDays)
    const days = (await listWriteOffTotalsStatement.all(retentionStartDate)).map((row) => ({
      date: row.record_date,
      totalWriteOff: Number(row.total_write_off || 0),
      itemsCount: Number(row.items_count || 0),
    }))

    json(res, 200, { days, limitDays })
    return true
  }

  if (pathname === '/api/archive/records' && req.method === 'GET') {
    const user = await requireUser(req, res)
    if (!user) return true

    const limitDays = Math.max(
      1,
      Math.min(10, parseInteger(requestUrl.searchParams.get('limitDays'), 3)),
    )
    const offsetDays = Math.max(
      0,
      parseInteger(requestUrl.searchParams.get('offsetDays'), 0),
    )
    const retentionStartDate = getRetentionStartDate(REPORT_ARCHIVE_DAYS)
    const [rows, countRow] = await Promise.all([
      listArchiveRecordsPageStatement.all(retentionStartDate, limitDays, offsetDays),
      countArchiveRecordDaysStatement.get(retentionStartDate),
    ])
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

    const totalDays = Number(countRow?.count || 0)
    json(res, 200, {
      records,
      limitDays,
      offsetDays,
      totalDays,
      hasMore: offsetDays + limitDays < totalDays,
    })
    return true
  }

  return false
}
