import { onBeforeUnmount, ref, watch } from 'vue'
import { recordsApi } from '../../../api'

const PAGE_SIZE = 20
const SHIFT_PAGE_SIZE = 10

export const useArchiveEmployees = () => {
  const employeeSearch = ref('')
  const employees = ref([])
  const employeesLoading = ref(false)
  const employeesHasMore = ref(false)
  const employeesTotal = ref(0)
  const selectedEmployee = ref(null)
  const employeeDetail = ref(null)
  const employeeDetailLoading = ref(false)
  let employeesOffset = 0
  let employeeShiftOffset = 0
  let searchTimer = null
  let searchEnabled = false
  let requestId = 0

  const loadEmployees = async ({ append = false } = {}) => {
    const currentRequest = ++requestId
    employeesLoading.value = true
    try {
      const offset = append ? employeesOffset : 0
      const response = await recordsApi.archiveEmployees({
        search: employeeSearch.value,
        limit: PAGE_SIZE,
        offset,
      })
      if (currentRequest !== requestId) return
      employees.value = append
        ? [...employees.value, ...(response.employees || [])]
        : response.employees || []
      employeesOffset = offset + (response.employees || []).length
      employeesTotal.value = Number(response.total || 0)
      employeesHasMore.value = Boolean(response.hasMore)
    } catch (error) {
      if (currentRequest === requestId) {
        alert(error?.message || 'Не удалось загрузить сотрудников')
      }
    } finally {
      if (currentRequest === requestId) employeesLoading.value = false
    }
  }

  const enableEmployeeSearch = async () => {
    searchEnabled = true
    await loadEmployees()
  }

  const loadMoreEmployees = () => {
    if (employeesHasMore.value) loadEmployees({ append: true })
  }

  const loadEmployee = async (employee, { append = false } = {}) => {
    if (!employee || employeeDetailLoading.value) return
    selectedEmployee.value = employee
    employeeDetailLoading.value = true
    try {
      const offset = append ? employeeShiftOffset : 0
      const response = await recordsApi.archiveEmployee({
        key: employee.key,
        limit: SHIFT_PAGE_SIZE,
        offset,
      })
      employeeDetail.value = append
        ? {
            ...response,
            shifts: [...(employeeDetail.value?.shifts || []), ...(response.shifts || [])],
          }
        : response
      employeeShiftOffset = offset + (response.shifts || []).length
    } catch (error) {
      alert(error?.message || 'Не удалось загрузить историю сотрудника')
    } finally {
      employeeDetailLoading.value = false
    }
  }

  const loadMoreEmployeeShifts = () => {
    if (employeeDetail.value?.hasMore && selectedEmployee.value) {
      loadEmployee(selectedEmployee.value, { append: true })
    }
  }

  watch(employeeSearch, () => {
    if (!searchEnabled) return
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => loadEmployees(), 300)
  })

  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
  })

  return {
    employeeSearch,
    employees,
    employeesLoading,
    employeesHasMore,
    employeesTotal,
    selectedEmployee,
    employeeDetail,
    employeeDetailLoading,
    enableEmployeeSearch,
    loadMoreEmployees,
    loadEmployee,
    loadMoreEmployeeShifts,
  }
}
