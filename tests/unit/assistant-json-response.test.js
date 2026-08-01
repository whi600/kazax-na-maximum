import { describe, expect, it } from 'vitest'
import { parseAssistantJsonContent } from '../../server/assistant/json-response.js'

describe('assistant JSON response parsing', () => {
  it('accepts a fenced JSON object', () => {
    expect(parseAssistantJsonContent('```json\n{"reply":"Готово","actions":[]}\n```')).toEqual({
      reply: 'Готово',
      actions: [],
    })
  })

  it('extracts JSON surrounded by short model commentary', () => {
    expect(parseAssistantJsonContent('Готово:\n{"reply":"Готово","actions":[]}\n')).toEqual({
      reply: 'Готово',
      actions: [],
    })
  })
})
