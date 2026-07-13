// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { resetOfflineDatabaseForTests } from '../../src/offline/indexedDb.js'
import {
  getReportOperation,
  listReportOperations,
  queueReportOperation,
  removeReportOperation,
} from '../../src/offline/reportOutbox.js'

afterEach(async () => {
  await resetOfflineDatabaseForTests()
})

describe('report outbox', () => {
  it('coalesces edits while preserving the original merge base', async () => {
    const first = await queueReportOperation({
      userId: 7,
      recordDate: '2026-07-13',
      entries: [{ product_id: 1, remainder: 2 }],
      baseEntries: [{ product_id: 1, remainder: 1 }],
      baseRevision: 4,
    })
    const second = await queueReportOperation({
      userId: 7,
      recordDate: '2026-07-13',
      entries: [{ product_id: 1, remainder: 3 }],
      baseEntries: [{ product_id: 1, remainder: 2 }],
      baseRevision: 5,
    })

    expect(second.operationId).not.toBe(first.operationId)
    expect(second.baseRevision).toBe(4)
    expect(second.baseEntries[0].remainder).toBe(1)
    expect((await listReportOperations(7))).toHaveLength(1)
  })

  it('does not remove a newer draft after an older request succeeds', async () => {
    const first = await queueReportOperation({
      userId: 7,
      recordDate: '2026-07-13',
      entries: [{ product_id: 1, remainder: 2 }],
      baseEntries: [],
      baseRevision: 0,
    })
    const second = await queueReportOperation({
      userId: 7,
      recordDate: '2026-07-13',
      entries: [{ product_id: 1, remainder: 3 }],
      baseEntries: [],
      baseRevision: 0,
    })

    expect(await removeReportOperation(first)).toBe(false)
    expect((await getReportOperation(7, '2026-07-13')).operationId).toBe(second.operationId)
  })
})
