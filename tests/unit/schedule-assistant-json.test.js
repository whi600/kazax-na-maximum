import { afterEach, describe, expect, it, vi } from 'vitest'
import { runScheduleAssistant } from '../../server/assistant/schedule-assistant.js'

const shifts = [
  {
    id: 12,
    date: '2026-08-10',
    start_time: '10:00',
    end_time: '18:00',
    employee_name: null,
    employee_user_id: null,
    status: 'approved',
  },
]

const users = [
  { id: 2, name: 'Анна', role: 'employee' },
  { id: 3, name: 'Бек', role: 'employee' },
]

const context = {
  command: 'Займи смену 10 августа с 10 до 18',
  today: '2026-08-01',
  user: { id: 2, name: 'Анна', role: 'employee' },
  canManageSchedule: false,
  shifts,
  users: [],
}

const testEnv = {
  AI_API_KEY: 'test-key',
  AI_API_BASE_URL: 'https://ai.example.test/v1',
  AI_MODEL: 'google/gemma-3n-e4b-it',
  AI_TIMEOUT_MS: '1000',
}

const successResponse = (message) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message }] }),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('schedule assistant JSON protocol', () => {
  it('uses strict JSON and accepts a booking for an ordinary employee', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Записываю вас на смену.',
        actions: [{ type: 'book_shift', shift_id: 12 }],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runScheduleAssistant({ ...context, env: testEnv })

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.temperature).toBe(0)
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'schedule_assistant_response',
        strict: true,
      },
    })
    expect(request.messages[0].content).toContain('РОВНО ОДИН валидный JSON-объект')
    expect(result).toEqual({
      reply: 'Записываю вас на смену.',
      actions: [{ type: 'book_shift', shiftId: 12 }],
    })
  })

  it('accepts a manager creating and immediately assigning a shift', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Создаю смену и назначаю Анну.',
        actions: [{
          type: 'create_shift',
          date: '2026-08-11',
          start_time: '10:00',
          end_time: '18:00',
          assignee_user_id: 2,
        }],
      }),
    })))

    const result = await runScheduleAssistant({
      ...context,
      user: { id: 1, name: 'Администратор', role: 'admin' },
      canManageSchedule: true,
      users,
      env: testEnv,
    })

    expect(result.actions).toEqual([{
      type: 'create_shift',
      date: '2026-08-11',
      startTime: '10:00',
      endTime: '18:00',
      assigneeUserId: 2,
    }])
  })

  it('rejects a manager-only action returned for an ordinary employee', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Создаю смену.',
        actions: [{
          type: 'create_shift',
          date: '2026-08-11',
          start_time: '10:00',
          end_time: '18:00',
          assignee_user_id: null,
        }],
      }),
    })))

    await expect(
      runScheduleAssistant({ ...context, env: testEnv }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_ACTION' })
  })

  it('rejects a booking for a shift outside the supplied schedule', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Готово.',
        actions: [{ type: 'book_shift', shift_id: 999 }],
      }),
    })))

    await expect(
      runScheduleAssistant({ ...context, env: testEnv }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_ACTION' })
  })

  it('rejects a shift that was omitted from the model context limit', async () => {
    const manyShifts = Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      date: '2026-08-10',
      start_time: '10:00',
      end_time: '18:00',
      employee_name: null,
      status: 'approved',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Готово.',
        actions: [{ type: 'book_shift', shift_id: 501 }],
      }),
    })))

    await expect(
      runScheduleAssistant({ ...context, shifts: manyShifts, env: testEnv }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_ACTION' })
  })

  it('falls back to the prompt when the provider rejects JSON Schema', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'response_format json_schema is not supported by this model' },
        }),
      })
      .mockResolvedValueOnce(successResponse({
        content: JSON.stringify({ reply: 'Уточните нужную смену.', actions: [] }),
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runScheduleAssistant({ ...context, env: testEnv })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format?.type).toBe('json_schema')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined()
    expect(result).toEqual({ reply: 'Уточните нужную смену.', actions: [] })
  })
})
