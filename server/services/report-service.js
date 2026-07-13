import { getApprovedShiftForUserDateStatement } from '../statements.js'
import { getToday } from '../date-utils.js'

export const getReportResource = (date) => `report:${date}`

export const mapReportStatus = (row) => ({
  completed: Boolean(row?.completed_at),
  completedAt: row?.completed_at || null,
  completedByName: row?.completed_by_name || null,
})

export const mapReportEntries = (rows) =>
  rows.map((row) => ({
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    arrival: row.arrival,
    remainder: row.remainder,
    write_off: row.write_off,
  }))

export const normalizeReportEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((item) => {
      const productId = Number(item.product_id)
      const arrival = Number(item.arrival || 0)
      const remainder = Number(item.remainder || 0)
      const writeOff = Number(item.write_off || 0)

      return {
        product_id: Number.isFinite(productId) ? productId : null,
        arrival: Number.isFinite(arrival) ? arrival : 0,
        remainder: Number.isFinite(remainder) ? remainder : 0,
        write_off: Number.isFinite(writeOff) ? writeOff : 0,
      }
    })
    .filter(
      (entry) =>
        entry.product_id !== null &&
        (entry.arrival !== 0 || entry.remainder !== 0 || entry.write_off !== 0),
    )

export const canEditDailyReport = async (user, date) => {
  if (user?.role === 'admin') return true
  if (!user?.name) return false
  return Boolean(await getApprovedShiftForUserDateStatement.get(date, user.name))
}

export const isPreviousLocalDay = (date) => {
  const previous = new Date()
  previous.setDate(previous.getDate() - 1)
  const year = previous.getFullYear()
  const month = String(previous.getMonth() + 1).padStart(2, '0')
  const day = String(previous.getDate()).padStart(2, '0')
  return date === `${year}-${month}-${day}`
}

export const canUseReportMutationDate = ({ user, date, offlineReplay }) =>
  date === getToday() || user?.role === 'admin' || (offlineReplay && isPreviousLocalDay(date))
