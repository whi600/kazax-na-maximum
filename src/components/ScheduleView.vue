<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editingApi, shiftsApi } from '../api'
import {
  addDays,
  createDefaultWeekTemplate,
  DEFAULT_WEEK_TEMPLATE_SHIFTS,
  formatDateHeader,
  formatDateInput,
  formatWeekDay,
  formatWeekRange,
  getCurrentWeekStart,
  getNextWeekStart,
  getWeekDates,
  getWeekStart,
  isPastDate,
  parseDate,
  pickMissingTemplateShifts,
  toDateKey,
} from '../scheduleUtils'
import {
  Calendar,
  Bell,
} from 'lucide-vue-next'
import SchedulePendingRequestsSheet from './SchedulePendingRequestsSheet.vue'
import ScheduleShiftCard from './ScheduleShiftCard.vue'
import ScheduleShiftModal from './ScheduleShiftModal.vue'
import ScheduleWeekControls from './ScheduleWeekControls.vue'

const props = defineProps({
  userRole: { type: String, default: '' },
  currentUser: { type: Object, default: null },
  displayName: { type: String, default: 'Сотрудник' },
  permissions: {
    type: Object,
    default: () => ({
      scheduleManage: false,
    }),
  },
})

const emit = defineEmits(['pending-count'])

const shifts = ref([])
const loading = ref(true)
const scheduleTemplateShifts = ref([])
const isModalOpen = ref(false)
const isExtraShift = ref(false)
const editingShiftId = ref(null)
const currentUserName = ref('Сотрудник')
const showPendingSheet = ref(false)
const selectedWeekStart = ref('')

const pendingDeleteIds = ref([])
const unsavedNewShifts = ref([])
const recentNewShiftIds = ref([])
const dismissedNewShiftIds = ref([])
const isSaving = ref(false)
const structureSaveStatus = ref('idle')
const scheduleCollabStatus = ref({
  activeEditors: [],
  lastChangedAt: null,
  lastChangedBy: null,
})
const overlayScrollState = {
  htmlOverflow: '',
  bodyOverflow: '',
  bodyTouchAction: '',
  htmlOverscrollBehavior: '',
  bodyOverscrollBehavior: '',
}
let structureStatusHideTimer = null
let structureAutosaveTimer = null
let suppressStructureAutosave = false
let tempShiftSeq = 0
const DEFAULT_WEEKS_BOOTSTRAP_KEY = 'kofeyny:default-weeks-bootstrap:v1'
const weekHoldTriggered = ref(false)
let weekHoldTimer = null
let schedulePresenceTimer = null

const form = ref({ date: '', start_time: '09:00', end_time: '18:00' })

const safeAlert = (message) => alert(message)
const safeConfirm = (message, callback) => callback(window.confirm(message))
const canManageSchedule = computed(
  () => Boolean(props.permissions?.scheduleManage || props.userRole === 'admin'),
)

const isAnyOverlayOpen = computed(
  () => isModalOpen.value || showPendingSheet.value,
)

const setStructureSaveStatus = (status) => {
  structureSaveStatus.value = status
  if (structureStatusHideTimer) clearTimeout(structureStatusHideTimer)

  if (status === 'saved' || status === 'error') {
    structureStatusHideTimer = setTimeout(() => {
      structureSaveStatus.value = 'idle'
      structureStatusHideTimer = null
    }, 12000)
  }
}

const structureSaveLabel = computed(() => {
  if (structureSaveStatus.value === 'saving') return 'Сохраняется...'
  if (structureSaveStatus.value === 'error') return 'Ошибка сохранения'
  if (structureSaveStatus.value === 'saved') return 'Сохранено'
  return ''
})

const isEditingShift = computed(() => editingShiftId.value !== null)
const modalEyebrow = computed(() => {
  if (isExtraShift.value) return 'Заявка на помощь'
  if (isEditingShift.value) return 'Редактирование смены'
  return 'Создание смены'
})
const modalTitle = computed(() => {
  if (isExtraShift.value) return 'Нужна помощь'
  if (isEditingShift.value) return 'Изменить смену'
  return 'Новая смена'
})
const modalSubmitLabel = computed(() => {
  if (isExtraShift.value) return 'Отправить заявку'
  if (isEditingShift.value) return 'Сохранить смену'
  return 'Добавить в черновик'
})

const structureSaveClass = computed(() => {
  if (structureSaveStatus.value === 'saving') return 'bg-blue-50 text-blue-600 border-blue-100'
  if (structureSaveStatus.value === 'error') return 'bg-red-50 text-red-500 border-red-100'
  if (structureSaveStatus.value === 'saved') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  return 'bg-slate-50 text-slate-400 border-slate-100'
})

const scheduleEditorsLabel = computed(() => {
  const names = scheduleCollabStatus.value.activeEditors.map((item) => item.user_name)
  if (names.length === 0) return ''
  if (names.length === 1) return `Сейчас редактирует: ${names[0]}`
  return `Сейчас редактируют: ${names.join(', ')}`
})

const stopSchedulePresence = async () => {
  if (schedulePresenceTimer) {
    clearInterval(schedulePresenceTimer)
    schedulePresenceTimer = null
  }

  if (canManageSchedule.value) {
    try {
      await editingApi.heartbeat({ resource: 'schedule', active: false })
    } catch {
      // noop
    }
  }
}

const lockPageScroll = () => {
  if (typeof document === 'undefined') return
  const { documentElement, body } = document

  if (!overlayScrollState.htmlOverflow) overlayScrollState.htmlOverflow = documentElement.style.overflow
  if (!overlayScrollState.bodyOverflow) overlayScrollState.bodyOverflow = body.style.overflow
  if (!overlayScrollState.bodyTouchAction) overlayScrollState.bodyTouchAction = body.style.touchAction
  if (!overlayScrollState.htmlOverscrollBehavior) {
    overlayScrollState.htmlOverscrollBehavior = documentElement.style.overscrollBehavior
  }
  if (!overlayScrollState.bodyOverscrollBehavior) {
    overlayScrollState.bodyOverscrollBehavior = body.style.overscrollBehavior
  }

  documentElement.style.overflow = 'hidden'
  documentElement.style.overscrollBehavior = 'none'
  body.style.overflow = 'hidden'
  body.style.overscrollBehavior = 'none'
  body.style.touchAction = 'none'
}

const unlockPageScroll = () => {
  if (typeof document === 'undefined') return
  const { documentElement, body } = document

  documentElement.style.overflow = overlayScrollState.htmlOverflow
  documentElement.style.overscrollBehavior = overlayScrollState.htmlOverscrollBehavior
  body.style.overflow = overlayScrollState.bodyOverflow
  body.style.overscrollBehavior = overlayScrollState.bodyOverscrollBehavior
  body.style.touchAction = overlayScrollState.bodyTouchAction
}

const syncSchedulePresence = async () => {
  if (!canManageSchedule.value) return

  try {
    await editingApi.heartbeat({ resource: 'schedule', active: true })
    const status = await editingApi.status('schedule')
    scheduleCollabStatus.value = {
      activeEditors: status.activeEditors || [],
      lastChangedAt: status.lastChangedAt || null,
      lastChangedBy: status.lastChangedBy || null,
    }
  } catch {
    // noop
  }
}

const ensureSchedulePresence = async () => {
  if (!canManageSchedule.value) {
    await stopSchedulePresence()
    return
  }

  await syncSchedulePresence()
  if (schedulePresenceTimer) clearInterval(schedulePresenceTimer)
  schedulePresenceTimer = setInterval(() => {
    syncSchedulePresence()
  }, 8000)
}

const hasBootstrappedDefaultWeeks = () => {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(DEFAULT_WEEKS_BOOTSTRAP_KEY) === '1'
}

const markDefaultWeeksBootstrapped = () => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEFAULT_WEEKS_BOOTSTRAP_KEY, '1')
}

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

const normalizePersonName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

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

const canSelfCancelBooking = (shift) => isCurrentUserShift(shift) && !isShiftPast(shift)

const makeTempShift = ({ date, start_time, end_time }) => ({
  id: -(Date.now() + tempShiftSeq++),
  date,
  start_time,
  end_time,
  status: 'approved',
  employee_name: null,
})

const isNewShift = (shift) => {
  const id = Number(shift?.id)
  if (!Number.isFinite(id) || dismissedNewShiftIds.value.includes(id)) return false
  return id < 0 || recentNewShiftIds.value.includes(id)
}

const markShiftInteracted = (shift) => {
  const id = Number(shift?.id)
  if (!Number.isFinite(id) || dismissedNewShiftIds.value.includes(id)) return
  dismissedNewShiftIds.value = [...dismissedNewShiftIds.value, id]
}

const loadScheduleTemplate = async () => {
  try {
    const response = await shiftsApi.template()
    scheduleTemplateShifts.value = response.shifts || []
  } catch {
    scheduleTemplateShifts.value = DEFAULT_WEEK_TEMPLATE_SHIFTS
  }
}

const fetchShifts = async ({ preserveDrafts = false, skipDefaultBootstrap = false } = {}) => {
  suppressStructureAutosave = true
  try {
    const previousWeekStart = selectedWeekStart.value
    const response = await shiftsApi.upcoming()
    shifts.value = response.shifts || []

    const approvedServerShifts = shifts.value.filter(
      (shift) => (shift.status || 'approved') === 'approved',
    )

    if (
      canManageSchedule.value &&
      approvedServerShifts.length === 0 &&
      !skipDefaultBootstrap &&
      !hasBootstrappedDefaultWeeks()
    ) {
      const currentWeek = getCurrentWeekStart()
      const nextWeek = getNextWeekStart(currentWeek)
      const defaults = [
        ...createDefaultWeekTemplate(currentWeek, scheduleTemplateShifts.value),
        ...createDefaultWeekTemplate(nextWeek, scheduleTemplateShifts.value),
      ]

      await shiftsApi.bulkSave({
        deletedIds: [],
        newShifts: defaults,
      })

      markDefaultWeeksBootstrapped()
      const refreshed = await shiftsApi.upcoming()
      shifts.value = refreshed.shifts || []
    } else if (approvedServerShifts.length > 0) {
      markDefaultWeeksBootstrapped()
    }

    const currentWeekStart = getCurrentWeekStart()
    const availableWeeks = Array.from(
      new Set(
        shifts.value
          .filter((shift) => (shift.status || 'approved') === 'approved')
          .map((shift) => getWeekStart(shift.date))
          .filter((weekStart) => weekStart >= currentWeekStart),
      ),
    ).sort()

    const firstApprovedShift = shifts.value
      .filter((shift) => (shift.status || 'approved') === 'approved')
      .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`))[0]

    if (previousWeekStart && availableWeeks.includes(previousWeekStart)) {
      selectedWeekStart.value = previousWeekStart
    } else if (firstApprovedShift) {
      selectedWeekStart.value = getWeekStart(firstApprovedShift.date)
    } else {
      selectedWeekStart.value = currentWeekStart
    }

    if (!preserveDrafts) {
      pendingDeleteIds.value = []
      unsavedNewShifts.value = []
    }
  } catch (error) {
    safeAlert(error?.message || 'Ошибка загрузки смен')
  } finally {
    suppressStructureAutosave = false
  }
}

const initialize = async () => {
  loading.value = true
  resolveUserName()
  await loadScheduleTemplate()
  await fetchShifts()
  loading.value = false
}

const approvedShifts = computed(() => {
  const all = [
    ...shifts.value.filter(
      (shift) =>
        (shift.status || 'approved') === 'approved' &&
        !pendingDeleteIds.value.includes(shift.id),
    ),
    ...unsavedNewShifts.value,
  ]

  return all.sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.start_time}`)
    const bTime = new Date(`${b.date}T${b.start_time}`)
    return aTime - bTime
  })
})

const groupedShifts = computed(() => {
  const groups = {}

  approvedShifts.value.forEach((shift) => {
    if (!groups[shift.date]) groups[shift.date] = []
    groups[shift.date].push(shift)
  })

  return groups
})

const weekStarts = computed(() => {
  const currentWeekStart = getCurrentWeekStart()
  const starts = new Set([currentWeekStart])

  approvedShifts.value.forEach((shift) => {
    const weekStart = getWeekStart(shift.date)
    if (weekStart >= currentWeekStart) starts.add(weekStart)
  })

  return Array.from(starts).sort()
})

const selectedWeekDays = computed(() => {
  const weekStart = selectedWeekStart.value || weekStarts.value[0] || getCurrentWeekStart()
  const start = parseDate(weekStart)

  return Array.from({ length: 7 }, (_, index) => {
    const date = toDateKey(addDays(start, index))
    const dayShifts = groupedShifts.value[date] || []
    const occupiedCount = dayShifts.filter((shift) => shift.employee_name).length

    return {
      date,
      isPast: isPastDate(date),
      shifts: dayShifts,
      occupiedCount,
      openCount: dayShifts.length - occupiedCount,
    }
  })
})

const selectedWeekStats = computed(() => {
  const shiftsCount = selectedWeekDays.value.reduce(
    (sum, day) => sum + day.shifts.length,
    0,
  )
  const openCount = selectedWeekDays.value.reduce((sum, day) => sum + day.openCount, 0)
  const myCount = selectedWeekDays.value.reduce(
    (sum, day) =>
      sum +
      day.shifts.filter((shift) => isCurrentUserShift(shift)).length,
    0,
  )

  return { shiftsCount, openCount, myCount }
})

const pendingRequests = computed(() =>
  shifts.value.filter((shift) => (shift.status || 'approved') === 'pending'),
)

const selectWeek = (weekStart) => {
  selectedWeekStart.value = weekStart
}

const onWeekTabClick = (weekStart) => {
  if (weekHoldTriggered.value) {
    weekHoldTriggered.value = false
    return
  }

  selectWeek(weekStart)
}

const cancelWeekHold = () => {
  if (!weekHoldTimer) return
  clearTimeout(weekHoldTimer)
  weekHoldTimer = null
}

const finishWeekHold = () => {
  cancelWeekHold()
  weekHoldTriggered.value = true
}

const waitForStructureSave = async () => {
  while (isSaving.value) {
    await new Promise((resolve) => {
      setTimeout(resolve, 80)
    })
  }
}

const startWeekHold = (weekStart) => {
  if (!canManageSchedule.value) return

  cancelWeekHold()
  weekHoldTriggered.value = false
  weekHoldTimer = setTimeout(() => {
    weekHoldTimer = null
    finishWeekHold()
    deleteWeek(weekStart)
  }, 650)
}

const deleteWeek = (weekStart) => {
  if (!canManageSchedule.value) return

  const weekDateSet = new Set(getWeekDates(weekStart))
  const weekServerShifts = shifts.value.filter((shift) => weekDateSet.has(shift.date))
  const weekUnsavedShifts = unsavedNewShifts.value.filter((shift) => weekDateSet.has(shift.date))
  const hasBookedShift = [...weekServerShifts, ...weekUnsavedShifts].some(
    (shift) => weekDateSet.has(shift.date) && Boolean(shift.employee_name),
  )

  if (hasBookedShift) {
    safeAlert('Нельзя удалить неделю: есть смены с записью сотрудников')
    return
  }

  safeConfirm(`Удалить всю неделю ${formatWeekRange(weekStart)}?`, async (ok) => {
    if (!ok) return

    markDefaultWeeksBootstrapped()
    if (structureAutosaveTimer) {
      clearTimeout(structureAutosaveTimer)
      structureAutosaveTimer = null
    }

    const previousSelectedWeekStart = selectedWeekStart.value
    const previousShifts = [...shifts.value]
    const previousUnsavedNewShifts = [...unsavedNewShifts.value]

    suppressStructureAutosave = true

    try {
      await waitForStructureSave()
      const currentWeekServerShifts = shifts.value.filter((shift) =>
        weekDateSet.has(shift.date),
      )

      unsavedNewShifts.value = unsavedNewShifts.value.filter(
        (shift) => !weekDateSet.has(shift.date),
      )
      shifts.value = shifts.value.filter((shift) => !weekDateSet.has(shift.date))

      if (selectedWeekStart.value === weekStart) {
        const remainingWeeks = weekStarts.value.filter((item) => item !== weekStart)
        selectedWeekStart.value = remainingWeeks[0] || getCurrentWeekStart()
      }

      if (currentWeekServerShifts.length > 0) {
        await shiftsApi.deleteWeek(weekStart)
      }

      await fetchShifts({ preserveDrafts: true, skipDefaultBootstrap: true })
      setStructureSaveStatus('saved')
    } catch (error) {
      shifts.value = previousShifts
      unsavedNewShifts.value = previousUnsavedNewShifts
      selectedWeekStart.value = previousSelectedWeekStart
      safeAlert(error?.message || 'Не удалось удалить неделю. Попробуйте еще раз')
    } finally {
      const shouldResumeAutosave = hasStructureChanges.value
      suppressStructureAutosave = false
      if (shouldResumeAutosave) {
        saveStructure({ silent: true })
      }
    }
  })
}

const addNextWeekTemplate = () => {
  if (!canManageSchedule.value) return

  const lastWeek = weekStarts.value[weekStarts.value.length - 1] || getCurrentWeekStart()
  const nextWeek = getNextWeekStart(lastWeek)
  const missing = pickMissingTemplateShifts(
    [nextWeek],
    approvedShifts.value,
    scheduleTemplateShifts.value,
  )

  if (missing.length === 0) {
    selectedWeekStart.value = nextWeek
    return
  }

  unsavedNewShifts.value.push(...missing.map(makeTempShift))
  selectedWeekStart.value = nextWeek
}

const bookShift = (shift) => {
  if (shift.employee_name) return
  markShiftInteracted(shift)

  safeConfirm(`Записаться на смену ${shift.start_time}-${shift.end_time}?`, async (ok) => {
    if (!ok) return

    try {
      await shiftsApi.book(shift.id)
      shift.employee_name = currentUserName.value
    } catch (error) {
      safeAlert(error?.message || 'Ошибка записи')
    }
  })
}

const cancelBooking = (shift) => {
  markShiftInteracted(shift)

  if (isCurrentUserShift(shift) && isShiftPast(shift)) {
    safeAlert('Нельзя снять запись с прошедшей смены')
    return
  }

  safeConfirm(`Убрать запись сотрудника ${shift.employee_name}?`, async (ok) => {
    if (!ok) return

    try {
      await shiftsApi.unbook(shift.id)
      shift.employee_name = null
    } catch (error) {
      safeAlert(error?.message || 'Не удалось убрать запись')
    }
  })
}

const openModal = (date = null, isHelp = false) => {
  isExtraShift.value = isHelp
  editingShiftId.value = null
  form.value = {
    date: date || new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00',
  }
  isModalOpen.value = true
}

const openEditModal = (shift) => {
  if (!canManageSchedule.value || !shift) return
  markShiftInteracted(shift)

  isExtraShift.value = false
  editingShiftId.value = shift.id
  form.value = {
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
  }
  isModalOpen.value = true
}

const closeModal = () => {
  editingShiftId.value = null
  isExtraShift.value = false
  isModalOpen.value = false
}

defineExpose({
  openCreateShift: () => openModal(),
  openHelpRequest: () => openModal(null, true),
  openPendingRequests: () => {
    showPendingSheet.value = true
  },
})

const handleSaveModal = async () => {
  if (!form.value.date || !form.value.start_time || !form.value.end_time) {
    safeAlert('Заполните дату и время')
    return
  }

  if (form.value.end_time <= form.value.start_time) {
    safeAlert('Время окончания должно быть позже начала')
    return
  }

  if (isPastDate(form.value.date)) {
    safeAlert('Нельзя добавить смену в прошедшую дату')
    return
  }

  if (isEditingShift.value) {
    const shiftId = editingShiftId.value
    if (!Number.isFinite(Number(shiftId))) {
      safeAlert('Не удалось определить смену для редактирования')
      return
    }

    if (Number(shiftId) < 0) {
      unsavedNewShifts.value = unsavedNewShifts.value.map((shift) =>
        shift.id === shiftId
          ? {
              ...shift,
              date: form.value.date,
              start_time: form.value.start_time,
              end_time: form.value.end_time,
            }
          : shift,
      )
      selectedWeekStart.value = getWeekStart(form.value.date)
      closeModal()
      await saveStructure({ silent: true })
      return
    }

    try {
      await shiftsApi.update(shiftId, form.value)
      await fetchShifts()
      selectedWeekStart.value = getWeekStart(form.value.date)
      setStructureSaveStatus('saved')
      closeModal()
    } catch (error) {
      safeAlert(error?.message || 'Не удалось обновить смену')
    }
    return
  }

  if (isExtraShift.value) {
    try {
      await shiftsApi.requestHelp(form.value)
      safeAlert('Заявка отправлена ✅')
      await fetchShifts()
    } catch (error) {
      safeAlert(error?.message || 'Не удалось отправить заявку')
      return
    }
  } else {
    const tempId = -Date.now()
    unsavedNewShifts.value.push({
      ...form.value,
      id: tempId,
      status: 'approved',
      employee_name: null,
    })
  }

  closeModal()
}

const markForDeletion = (shift) => {
  markShiftInteracted(shift)

  safeConfirm('Удалить эту смену из расписания?', (ok) => {
    if (!ok) return

    if (shift.id < 0) {
      unsavedNewShifts.value = unsavedNewShifts.value.filter(
        (item) => item.id !== shift.id,
      )
    } else {
      if (!pendingDeleteIds.value.includes(shift.id)) {
        pendingDeleteIds.value = [...pendingDeleteIds.value, shift.id]
      }
    }
  })
}

const approveRequest = async (shift) => {
  try {
    await shiftsApi.approve(shift.id)
    shift.status = 'approved'
    if (pendingRequests.value.length === 0) showPendingSheet.value = false
  } catch (error) {
    safeAlert(error?.message || 'Не удалось подтвердить заявку')
  }
}

const rejectRequest = async (shiftId) => {
  try {
    await shiftsApi.remove(shiftId)
    shifts.value = shifts.value.filter((shift) => shift.id !== shiftId)
    if (pendingRequests.value.length === 0) showPendingSheet.value = false
  } catch (error) {
    safeAlert(error?.message || 'Не удалось отклонить заявку')
  }
}

const hasStructureChanges = computed(
  () => unsavedNewShifts.value.length > 0 || pendingDeleteIds.value.length > 0,
)

const getDraftShiftKey = (shift) =>
  `${shift?.date || ''}|${shift?.start_time || ''}|${shift?.end_time || ''}`

const saveStructure = async ({ silent = false } = {}) => {
  if (!hasStructureChanges.value) return true
  if (isSaving.value) return false
  isSaving.value = true
  setStructureSaveStatus('saving')

  const savedDeleteIds = [...pendingDeleteIds.value]
  const savedTempIds = unsavedNewShifts.value.map((shift) => shift.id)
  const savedTempKeys = new Map(
    unsavedNewShifts.value.map((shift) => [shift.id, getDraftShiftKey(shift)]),
  )
  const savedNewShifts = unsavedNewShifts.value.map(({ date, start_time, end_time }) => ({
    date,
    start_time,
    end_time,
  }))

  try {
    const response = await shiftsApi.bulkSave({
      deletedIds: savedDeleteIds,
      newShifts: savedNewShifts,
    })

    pendingDeleteIds.value = pendingDeleteIds.value.filter(
      (id) => !savedDeleteIds.includes(id),
    )
    unsavedNewShifts.value = unsavedNewShifts.value.filter(
      (shift) =>
        !savedTempIds.includes(shift.id) ||
        getDraftShiftKey(shift) !== savedTempKeys.get(shift.id),
    )
    await fetchShifts({
      preserveDrafts: true,
      skipDefaultBootstrap: savedDeleteIds.length > 0,
    })
    const createdIds = Array.isArray(response?.createdIds)
      ? response.createdIds.map(Number).filter(Number.isFinite)
      : []
    if (createdIds.length > 0) {
      const existing = recentNewShiftIds.value.filter(
        (id) => !dismissedNewShiftIds.value.includes(id),
      )
      recentNewShiftIds.value = Array.from(new Set([...existing, ...createdIds]))
    }
    setStructureSaveStatus('saved')
    return true
  } catch (error) {
    setStructureSaveStatus('error')
    if (!silent) safeAlert(error?.message || 'Не удалось сохранить изменения')
    return false
  } finally {
    isSaving.value = false
    if (hasStructureChanges.value && !suppressStructureAutosave) {
      saveStructure({ silent: true })
    }
  }
}

watch(
  () => props.displayName,
  () => {
    resolveUserName()
  },
)

watch(
  weekStarts,
  (weeks) => {
    if (weeks.length === 0) {
      selectedWeekStart.value = getCurrentWeekStart()
      return
    }

    if (!weeks.includes(selectedWeekStart.value)) {
      selectedWeekStart.value = weeks[0]
    }
  },
  { immediate: true },
)

watch(
  pendingRequests,
  (requests) => {
    emit('pending-count', requests.length)
    if (requests.length === 0) showPendingSheet.value = false
  },
  { immediate: true },
)

watch(
  [unsavedNewShifts, () => pendingDeleteIds.value.length],
  () => {
    if (!canManageSchedule.value) return
    if (suppressStructureAutosave) return
    if (!hasStructureChanges.value) return
    if (isModalOpen.value) return

    if (structureAutosaveTimer) clearTimeout(structureAutosaveTimer)
    structureAutosaveTimer = setTimeout(() => {
      saveStructure({ silent: true })
    }, 600)
  },
  { deep: true },
)

onMounted(initialize)
onMounted(ensureSchedulePresence)

watch(
  isAnyOverlayOpen,
  (isOpen) => {
    if (isOpen) {
      lockPageScroll()
      return
    }
    unlockPageScroll()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (structureAutosaveTimer) clearTimeout(structureAutosaveTimer)
  if (structureStatusHideTimer) clearTimeout(structureStatusHideTimer)
  cancelWeekHold()
  stopSchedulePresence()
  unlockPageScroll()
})
</script>

<template>
  <div class="pb-32 bg-slate-50 min-h-screen">
    <div v-if="loading" class="flex flex-col items-center justify-center py-20 opacity-30">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p class="text-[10px] font-black uppercase tracking-widest">Загрузка...</p>
    </div>

    <Transition name="schedule-shell" appear mode="out-in">
      <div v-if="!loading" class="px-3 py-4">
        <div
          v-if="canManageSchedule && scheduleEditorsLabel"
          class="schedule-fade rounded-lg border border-amber-100 bg-amber-50 text-amber-700 px-3 py-2 text-[10px] font-black uppercase mb-3"
        >
          {{ scheduleEditorsLabel }}
        </div>

        <ScheduleWeekControls
          :week-starts="weekStarts"
          :selected-week-start="selectedWeekStart"
          :selected-week-stats="selectedWeekStats"
          :can-manage-schedule="canManageSchedule"
          @select-week="onWeekTabClick"
          @hold-week="startWeekHold"
          @cancel-hold="cancelWeekHold"
          @add-week="addNextWeekTemplate"
        />

        <TransitionGroup name="day-card" appear tag="div" class="space-y-8">
          <div v-for="(day, dayIndex) in selectedWeekDays" :key="day.date" class="day-card">
            <div class="flex items-center justify-between mb-3 ml-1">
              <div>
                <h3
                  class="text-[11px] font-black uppercase tracking-widest"
                  :class="day.isPast ? 'text-slate-300' : 'text-blue-600'"
                >
                  {{ formatDateHeader(day.date) }}
                </h3>
              </div>
            </div>

            <div
              v-if="day.shifts.length === 0"
              class="border border-dashed rounded-lg p-4 text-center"
              :class="day.isPast ? 'bg-slate-100/70 border-slate-200' : 'bg-white/70 border-slate-100'"
            >
              <p
                class="text-[10px] font-black uppercase"
                :class="day.isPast ? 'text-slate-300' : 'text-slate-300'"
              >
                {{ formatWeekDay(day.date) }} свободен
              </p>
            </div>

            <TransitionGroup name="shift-card" appear tag="div" class="space-y-2">
              <ScheduleShiftCard
                v-for="(shift, shiftIndex) in day.shifts"
                :key="shift.id"
                :shift="shift"
                :is-past="day.isPast"
                :is-new="isNewShift(shift)"
                :can-manage-schedule="canManageSchedule"
                :can-self-cancel="canSelfCancelBooking(shift)"
                :day-delay="`${dayIndex * 80}ms`"
                :shift-delay="`${shiftIndex * 70}ms`"
                @book="bookShift(shift)"
                @cancel="cancelBooking(shift)"
                @edit="openEditModal(shift)"
                @delete="markForDeletion(shift)"
              />
            </TransitionGroup>
          </div>
        </TransitionGroup>

        <div v-if="approvedShifts.length === 0" class="text-center py-20 opacity-20 schedule-fade">
          <Calendar class="w-12 h-12 mx-auto mb-2" />
          <p class="text-xs font-black uppercase">График не заполнен</p>
        </div>
      </div>
    </Transition>

    <div
      v-if="canManageSchedule && structureSaveLabel"
      class="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
      :style="{ bottom: 'calc(86px + var(--app-safe-bottom, env(safe-area-inset-bottom)))' }"
    >
      <div
        class="rounded-full border px-4 py-2 text-[11px] font-black uppercase shadow-sm backdrop-blur-sm"
        :class="structureSaveClass"
      >
        {{ structureSaveLabel }}
      </div>
    </div>

    <ScheduleShiftModal
      v-if="isModalOpen"
      :eyebrow="modalEyebrow"
      :title="modalTitle"
      :submit-label="modalSubmitLabel"
      :formatted-date="formatDateInput(form.date)"
      :date="form.date"
      :start-time="form.start_time"
      :end-time="form.end_time"
      @close="closeModal"
      @submit="handleSaveModal"
      @update:date="form.date = $event"
      @update:start-time="form.start_time = $event"
      @update:end-time="form.end_time = $event"
    />

    <SchedulePendingRequestsSheet
      v-if="showPendingSheet && canManageSchedule"
      :requests="pendingRequests"
      :format-date-header="formatDateHeader"
      @close="showPendingSheet = false"
      @reject="rejectRequest"
      @approve="approveRequest"
    />
  </div>
</template>
