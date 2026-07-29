import { handleAdminRoutes } from './admin-routes.js'
import { handleAssistantRoutes } from './assistant-routes.js'
import { handleAuthRoutes } from './auth-routes.js'
import { handleArchiveV2Routes } from './archive-v2-routes.js'
import { handleNotificationRoutes } from './notification-routes.js'
import { handleProductRecordRoutes } from './product-record-routes.js'
import { handleScheduleTemplateRoutes } from './schedule-template-routes.js'
import { handleShiftRoutes } from './shift-routes.js'

const routeHandlers = [
  handleAuthRoutes,
  handleAssistantRoutes,
  handleNotificationRoutes,
  handleArchiveV2Routes,
  handleProductRecordRoutes,
  handleShiftRoutes,
  handleScheduleTemplateRoutes,
  handleAdminRoutes,
]

export const handleApiRoutes = async (context) => {
  for (const handler of routeHandlers) {
    if (await handler(context)) return true
  }

  return false
}
