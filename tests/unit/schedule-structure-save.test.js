import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api.js'
import { useScheduleStructureSave } from '../../src/components/schedule/composables/useScheduleStructureSave.js'

const apiMocks = vi.hoisted(() => ({ bulkSave: vi.fn() }))

vi.mock('../../src/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    shiftsApi: { ...actual.shiftsApi, bulkSave: apiMocks.bulkSave },
  }
})

const makeSubject = () => {
  const scheduleRevision = ref(4)
  const pendingDeleteIds = ref([])
  const unsavedNewShifts = ref([
    { id: -1, date: '2026-07-14', start_time: '09:00', end_time: '15:00' },
  ])
  const recentNewShiftIds = ref([])
  const dismissedNewShiftIds = ref([])
  const fetchShifts = vi.fn().mockResolvedValue(undefined)
  const setSaveStatus = vi.fn()
  const safeAlert = vi.fn()
  const subject = useScheduleStructureSave({
    scheduleRevision,
    pendingDeleteIds,
    unsavedNewShifts,
    recentNewShiftIds,
    dismissedNewShiftIds,
    suppressAutosave: ref(true),
    fetchShifts,
    closeModal: vi.fn(),
    setSaveStatus,
    safeAlert,
  })
  return {
    subject,
    scheduleRevision,
    unsavedNewShifts,
    recentNewShiftIds,
    fetchShifts,
    setSaveStatus,
    safeAlert,
  }
}

beforeEach(() => {
  apiMocks.bulkSave.mockReset()
})

describe('schedule structure save', () => {
  it('keeps a draft added while an older request is in flight', async () => {
    let resolveSave
    apiMocks.bulkSave.mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const state = makeSubject()

    const saving = state.subject.saveStructure()
    await vi.waitFor(() => expect(apiMocks.bulkSave).toHaveBeenCalledOnce())
    state.unsavedNewShifts.value.push({
      id: -2,
      date: '2026-07-15',
      start_time: '14:00',
      end_time: '21:00',
    })
    resolveSave({ revision: 5, createdIds: [101] })
    await saving

    expect(state.unsavedNewShifts.value.map((shift) => shift.id)).toEqual([-2])
    expect(state.recentNewShiftIds.value).toEqual([101])
    expect(state.scheduleRevision.value).toBe(5)
    expect(state.fetchShifts).toHaveBeenCalledWith({
      preserveDrafts: true,
      skipDefaultBootstrap: false,
    })
  })

  it('exposes a revision conflict and can force the original draft', async () => {
    apiMocks.bulkSave
      .mockRejectedValueOnce(new ApiError('Conflict', {
        status: 409,
        code: 'REVISION_CONFLICT',
        details: { currentRevision: 9 },
      }))
      .mockResolvedValueOnce({ revision: 10, createdIds: [102] })
    const state = makeSubject()

    expect(await state.subject.saveStructure()).toBe(false)
    expect(state.subject.scheduleConflict.value).toMatchObject({
      baseRevision: 4,
      currentRevision: 9,
    })

    await state.subject.forceScheduleConflict()

    expect(apiMocks.bulkSave).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ baseRevision: 4, force: true }),
    )
    expect(state.subject.scheduleConflict.value).toBeNull()
    expect(state.scheduleRevision.value).toBe(10)
  })
})
