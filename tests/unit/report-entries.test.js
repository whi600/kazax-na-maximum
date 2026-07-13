import { describe, expect, it } from 'vitest'
import {
  applyReportConflictChoices,
  buildReportPayload,
  mergeReportVersions,
} from '../../src/report/reportEntries.js'

describe('report entries', () => {
  it('does not send all-zero rows to the server', () => {
    expect(buildReportPayload([
      { product_id: 1, arrival: null, remainder: 0, write_off: '' },
      { product_id: 2, arrival: 1, remainder: 0, write_off: 0 },
    ])).toEqual([{ product_id: 2, arrival: 1, remainder: 0, write_off: 0 }])
  })

  it('automatically merges independent field edits', () => {
    const result = mergeReportVersions({
      baseEntries: [{ product_id: 1, name: 'Эклер', arrival: 1, remainder: 2 }],
      localEntries: [{ product_id: 1, name: 'Эклер', arrival: 3, remainder: 2 }],
      serverEntries: [{ product_id: 1, name: 'Эклер', arrival: 1, remainder: 4 }],
    })
    expect(result.conflicts).toEqual([])
    expect(result.entries[0]).toMatchObject({ arrival: 3, remainder: 4 })
  })

  it('requires a choice when both sides changed the same field', () => {
    const result = mergeReportVersions({
      baseEntries: [{ product_id: 1, name: 'Эклер', remainder: 2 }],
      localEntries: [{ product_id: 1, name: 'Эклер', remainder: 3 }],
      serverEntries: [{ product_id: 1, name: 'Эклер', remainder: 4 }],
    })
    expect(result.conflicts).toHaveLength(1)
    expect(applyReportConflictChoices(result, { '1:remainder': 'server' })[0].remainder).toBe(4)
  })
})
