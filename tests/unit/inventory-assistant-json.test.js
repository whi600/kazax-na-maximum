import { afterEach, describe, expect, it, vi } from 'vitest'
import { runInventoryAssistant } from '../../server/assistant/inventory-assistant.js'

const products = [
  { id: 7, name: 'Молоко', category: 'other', unit: 'л' },
]

const context = {
  command: 'Поставь остаток молока 7',
  date: '2026-07-29',
  entries: [],
  products,
}

const testEnv = (toolMode) => ({
  AI_API_KEY: 'test-key',
  AI_API_BASE_URL: 'https://ai.example.test/v1',
  AI_MODEL: 'google/gemma-3n-e4b-it',
  AI_TIMEOUT_MS: '1000',
  AI_TOOL_MODE: toolMode,
})

const successResponse = (message) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message }] }),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('inventory assistant JSON fallback', () => {
  it('uses one no-tools request in json mode and normalizes an allowed action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Остаток молока установлен: 7 л.',
        actions: [{ type: 'set_remainder', product_id: 7, remainder: 7 }],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runInventoryAssistant({ ...context, env: testEnv('json') })

    expect(fetchMock).toHaveBeenCalledOnce()
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.model).toBe('google/gemma-3n-e4b-it')
    expect(request.tools).toBeUndefined()
    expect(request.messages[0].content).toContain('JSON')
    expect(result).toEqual({
      reply: 'Остаток молока установлен: 7 л.',
      actions: [{ type: 'set_remainder', productId: 7, remainder: 7 }],
    })
  })

  it('falls back to JSON when a provider rejects native tools in auto mode', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Tools are not supported by this model.' } }),
      })
      .mockResolvedValueOnce(successResponse({
        content: JSON.stringify({ reply: 'Уточните количество.', actions: [] }),
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runInventoryAssistant({ ...context, env: testEnv('auto') })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toBeUndefined()
    expect(result).toEqual({ reply: 'Уточните количество.', actions: [] })
  })

  it('rejects a JSON action for an unknown product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse({
      content: JSON.stringify({
        reply: 'Готово.',
        actions: [{ type: 'set_remainder', product_id: 999, remainder: 1 }],
      }),
    })))

    await expect(
      runInventoryAssistant({ ...context, env: testEnv('json') }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_ACTION' })
  })
})
