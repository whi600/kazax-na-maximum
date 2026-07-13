import { requireUser } from '../auth.js'
import { badRequest, json } from '../http.js'
import { getRetentionStartDate, parseInteger } from '../api-utils.js'
import {
  countArchiveRecordDaysStatement,
  countWriteOffDaysStatement,
  listArchiveRecordsPageStatement,
  listWriteOffDetailsByDateStatement,
  listWriteOffTotalsPageStatement,
} from '../statements.js'

const REPORT_ARCHIVE_DAYS = 10

export const handleArchiveRecordRoutes = async ({ req, res, pathname, requestUrl }) => {
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
      Math.min(30, parseInteger(requestUrl.searchParams.get('limitDays'), 10)),
    )
    const offsetDays = Math.max(
      0,
      parseInteger(requestUrl.searchParams.get('offsetDays'), 0),
    )
    const [rows, countRow] = await Promise.all([
      listWriteOffTotalsPageStatement.all(limitDays, offsetDays),
      countWriteOffDaysStatement.get(),
    ])
    const totalDays = Number(countRow?.count || 0)
    json(res, 200, {
      days: rows.map((row) => ({
        date: row.record_date,
        totalWriteOff: Number(row.total_write_off || 0),
        itemsCount: Number(row.items_count || 0),
      })),
      limitDays,
      offsetDays,
      totalDays,
      hasMore: offsetDays + limitDays < totalDays,
    })
    return true
  }

  if (pathname !== '/api/archive/records' || req.method !== 'GET') return false
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
  const totalDays = Number(countRow?.count || 0)
  json(res, 200, {
    records: rows.map((row) => ({
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
    })),
    limitDays,
    offsetDays,
    totalDays,
    hasMore: offsetDays + limitDays < totalDays,
  })
  return true
}
