import { computed, ref } from 'vue'
import { shiftsApi } from '../../../api'
import { formatDateHeader } from '../../../scheduleUtils'

const normalizePersonName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

export const useScheduleBooking = ({
  props,
  canManageSchedule,
  shifts,
  scheduleRevision,
  saveStructure,
  fetchShifts,
  markShiftInteracted,
  setStructureSaveStatus,
  safeAlert,
  safeConfirm,
}) => {
  const currentUserName = ref('Сотрудник')
  const isAssignModalOpen = ref(false)
  const assignShift = ref(null)
  const assignableUsers = ref([])
  const assignUsersLoading = ref(false)
  const assignUsersError = ref('')
  const assignBusy = ref(false)
  const selectedAssignUserId = ref(null)

  const assignShiftLabel = computed(() => {
    const shift = assignShift.value
    if (!shift) return ''
    return `${formatDateHeader(shift.date)} · ${shift.start_time}-${shift.end_time}`
  })

  const resolveUserName = () => {
    if (props.displayName?.trim()) {
      currentUserName.value = props.displayName.trim()
      return
    }

    if (props.currentUser?.name) {
      currentUserName.value = props.currentUser.name
      return
    }

    if (props.currentUser?.email?.includes('@')) {
      currentUserName.value = props.currentUser.email.split('@')[0]
      return
    }

    currentUserName.value = 'Сотрудник'
  }

  const isShiftPast = (shift) => {
    const now = new Date()
    const shiftEnd = new Date(`${shift.date}T${shift.end_time}`)
    return shiftEnd <= now
  }

  const isCurrentUserShift = (shift) => {
    const shiftName = normalizePersonName(shift.employee_name)
    if (!shiftName) return false

    const candidates = [
      currentUserName.value,
      props.currentUser?.name,
      props.currentUser?.email?.split('@')[0],
    ]
      .map(normalizePersonName)
      .filter(Boolean)

    return candidates.includes(shiftName)
  }

  const canSelfCancelBooking = (shift) =>
    isCurrentUserShift(shift) &&
    !isShiftPast(shift) &&
    !shift.unbook_request

  const loadAssignableUsers = async () => {
    if (!canManageSchedule.value) return
    if (assignableUsers.value.length > 0 || assignUsersLoading.value) return

    assignUsersError.value = ''
    assignUsersLoading.value = true
    try {
      const response = await shiftsApi.assignableUsers()
      assignableUsers.value = response.users || []
    } catch (error) {
      assignUsersError.value = error?.message || 'Не удалось загрузить сотрудников'
    } finally {
      assignUsersLoading.value = false
    }
  }

  const resolveDefaultAssignUserId = () => {
    const currentId = Number(props.currentUser?.id)
    if (Number.isFinite(currentId)) return currentId

    const currentEmail = String(props.currentUser?.email || '').toLowerCase()
    const byEmail = assignableUsers.value.find(
      (user) => String(user.email || '').toLowerCase() === currentEmail,
    )
    if (byEmail) return byEmail.id

    return assignableUsers.value[0]?.id || null
  }

  const reloadAssignableUsers = async () => {
    assignableUsers.value = []
    await loadAssignableUsers()
    if (!selectedAssignUserId.value) {
      selectedAssignUserId.value = resolveDefaultAssignUserId()
    }
  }

  const findPersistedShift = (draftShift) =>
    shifts.value.find(
      (shift) =>
        shift.date === draftShift.date &&
        shift.start_time === draftShift.start_time &&
        shift.end_time === draftShift.end_time &&
        !shift.employee_name &&
        (shift.status || 'approved') === 'approved',
    )

  const resolveShiftForServerAction = async (shift) => {
    if (Number(shift?.id) > 0) return shift

    await saveStructure({ silent: true })
    await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
    return findPersistedShift(shift)
  }

  const bookShift = (shift) => {
    if (shift.employee_name) return
    markShiftInteracted(shift)

    safeConfirm(`Записаться на смену ${shift.start_time}-${shift.end_time}?`, async (ok) => {
      if (!ok) return

      try {
        const response = await shiftsApi.book(shift.id)
        scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
        shift.employee_name = currentUserName.value
      } catch (error) {
        safeAlert(error?.message || 'Ошибка записи')
      }
    })
  }

  const openAssignModal = async (shift) => {
    if (!canManageSchedule.value || shift.employee_name) return
    markShiftInteracted(shift)

    const persistedShift = await resolveShiftForServerAction(shift)
    if (!persistedShift) {
      safeAlert('Смена еще сохраняется. Попробуйте через секунду')
      return
    }

    assignShift.value = persistedShift
    selectedAssignUserId.value = resolveDefaultAssignUserId()
    assignUsersError.value = ''
    isAssignModalOpen.value = true
    await loadAssignableUsers()
    if (!selectedAssignUserId.value) {
      selectedAssignUserId.value = resolveDefaultAssignUserId()
    }
  }

  const closeAssignModal = () => {
    if (assignBusy.value) return
    isAssignModalOpen.value = false
    assignShift.value = null
  }

  const assignSelectedUser = async () => {
    const shift = assignShift.value
    if (!shift || !selectedAssignUserId.value || assignBusy.value) return

    assignBusy.value = true
    try {
      const response = await shiftsApi.assign(shift.id, selectedAssignUserId.value)
      scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
      const employeeName = response.employee_name
      shifts.value = shifts.value.map((item) =>
        item.id === shift.id ? { ...item, employee_name: employeeName } : item,
      )
      setStructureSaveStatus('saved')
      isAssignModalOpen.value = false
      assignShift.value = null
    } catch (error) {
      safeAlert(error?.message || 'Не удалось назначить сотрудника')
      await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
    } finally {
      assignBusy.value = false
    }
  }

  const handleBookClick = (shift) => {
    if (canManageSchedule.value) {
      openAssignModal(shift)
      return
    }

    bookShift(shift)
  }

  const cancelBooking = (shift) => {
    markShiftInteracted(shift)

    if (isCurrentUserShift(shift) && isShiftPast(shift)) {
      safeAlert('Нельзя снять запись с прошедшей смены')
      return
    }

    if (!canManageSchedule.value && !isCurrentUserShift(shift)) {
      safeAlert('Вы можете отправить заявку только по своей смене')
      return
    }

    const message = canManageSchedule.value
      ? `Убрать запись сотрудника ${shift.employee_name}?`
      : `Отправить админу заявку на снятие со смены ${shift.start_time}-${shift.end_time}?`

    safeConfirm(message, async (ok) => {
      if (!ok) return

      try {
        if (canManageSchedule.value) {
          const response = await shiftsApi.unbook(shift.id)
          scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
          shift.employee_name = null
          shift.unbook_request = null
          return
        }

        const response = await shiftsApi.requestUnbook(shift.id)
        scheduleRevision.value = Number(response.revision || scheduleRevision.value + 1)
        shift.unbook_request = response.request
      } catch (error) {
        safeAlert(error?.message || 'Не удалось отправить заявку')
      }
    })
  }

  return {
    currentUserName,
    isAssignModalOpen,
    assignShiftLabel,
    assignableUsers,
    assignUsersLoading,
    assignUsersError,
    assignBusy,
    selectedAssignUserId,
    resolveUserName,
    isCurrentUserShift,
    canSelfCancelBooking,
    reloadAssignableUsers,
    closeAssignModal,
    assignSelectedUser,
    handleBookClick,
    cancelBooking,
  }
}
