import { describe, expect, it } from 'vitest'
import { buildRecordsDaySections } from '../../src/archiveUtils.js'

describe('archive report sections', () => {
  it('keeps the stable category order and omits empty groups', () => {
    const [section] = buildRecordsDaySections({
      '2026-07-13': [
        { id: 1, products: { name: 'Булка', category: 'bakery' } },
        { id: 2, products: { name: 'Эклер', category: 'pastry' } },
      ],
    })

    expect(section.rows.map((row) => row.categoryKey)).toEqual([
      'pastry',
      'pastry',
      'bakery',
      'bakery',
    ])
    expect(section.rows.filter((row) => row.rowType === 'category')).toHaveLength(2)
  })
})
