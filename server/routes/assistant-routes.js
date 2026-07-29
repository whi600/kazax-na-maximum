import { requireUser } from '../auth.js'
import { runInventoryAssistant } from '../assistant/inventory-assistant.js'
import { getToday } from '../date-utils.js'
import { badRequest, forbidden, json, readJsonBody } from '../http.js'
import {
  getDailyReportStatusStatement,
  listProductsStatement,
  listTodayRecordsStatement,
} from '../statements.js'
import {
  canEditDailyReport,
  canOverrideCompletedReport,
  mapReportEntries,
} from '../services/report-service.js'

const COMMAND_LIMIT = 1_200

export const handleAssistantRoutes = async ({ req, res, pathname }) => {
  if (pathname !== '/api/assistant/inventory' || req.method !== 'POST') return false

  const user = await requireUser(req, res)
  if (!user) return true

  const body = await readJsonBody(req, 10_000)
  const command = String(body.command || '').trim()
  if (!command) {
    badRequest(res, 'Скажите или напишите команду для помощника.')
    return true
  }
  if (command.length > COMMAND_LIMIT) {
    badRequest(res, 'Команда слишком длинная. Сократите её до 1200 символов.')
    return true
  }

  const date = getToday()
  if (!(await canEditDailyReport(user, date))) {
    forbidden(res, 'Изменять остатки может только сотрудник со сменой или администратор.')
    return true
  }

  const reportStatus = await getDailyReportStatusStatement.get(date)
  if (reportStatus?.completed_at && !canOverrideCompletedReport(user)) {
    forbidden(res, 'Отчёт уже закрыт. Для изменений обратитесь к администратору.')
    return true
  }

  const [products, rows] = await Promise.all([
    listProductsStatement.all(),
    listTodayRecordsStatement.all(date),
  ])
  const result = await runInventoryAssistant({
    command,
    date,
    products,
    entries: mapReportEntries(rows),
  })

  json(res, 200, result)
  return true
}
