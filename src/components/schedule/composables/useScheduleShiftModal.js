import { computed, ref } from 'vue'
import { toDateKey } from '../../../scheduleUtils'

export const useScheduleShiftModal = ({ canManageSchedule, markShiftInteracted }) => {
  const isModalOpen = ref(false)
  const isExtraShift = ref(false)
  const editingShiftId = ref(null)
  const form = ref({ date: '', start_time: '09:00', end_time: '18:00' })

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

  const openModal = (date = null, isHelp = false) => {
    isExtraShift.value = isHelp
    editingShiftId.value = null
    form.value = {
      date: date || toDateKey(new Date()),
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

  return {
    isModalOpen,
    isExtraShift,
    editingShiftId,
    form,
    isEditingShift,
    modalEyebrow,
    modalTitle,
    modalSubmitLabel,
    openModal,
    openEditModal,
    closeModal,
  }
}
