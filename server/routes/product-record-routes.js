import { handleArchiveRecordRoutes } from './archive-record-routes.js'
import { handleDailyReportRoutes } from './daily-report-routes.js'
import { handleProductRoutes } from './product-routes.js'

const handlers = [handleProductRoutes, handleDailyReportRoutes, handleArchiveRecordRoutes]

export const handleProductRecordRoutes = async (context) => {
  for (const handler of handlers) {
    if (await handler(context)) return true
  }
  return false
}
