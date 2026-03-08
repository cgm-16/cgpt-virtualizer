// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { measureBubble } from '../../src/content/measure.ts'
import {
  buildPrefixSums,
  extendPrefixSums,
  rebuildPrefixSumsFromIndex,
} from '../../src/content/prefix-sums.ts'
import type { BubbleRecord } from '../../src/content/state.ts'

function makeBubbleRecord(index: number, measuredHeight: number): BubbleRecord {
  return {
    index,
    measuredHeight,
    mounted: false,
    node: document.createElement('article'),
    pinned: false,
  }
}

describe('measureBubble', () => {
  it('returns the floating-point DOM height', () => {
    const bubble = document.createElement('article')
    bubble.getBoundingClientRect = () => ({ height: 123.45 }) as DOMRect

    expect(measureBubble(bubble)).toBe(123.45)
  })
})

describe('buildPrefixSums', () => {
  it('returns empty prefix sums for an empty record list', () => {
    expect(buildPrefixSums([])).toEqual([])
  })

  it('builds cumulative heights from ordered records', () => {
    const records = [
      makeBubbleRecord(0, 10.25),
      makeBubbleRecord(1, 20.5),
      makeBubbleRecord(2, 5.75),
    ]

    expect(buildPrefixSums(records)).toEqual([10.25, 30.75, 36.5])
  })
})

describe('rebuildPrefixSumsFromIndex', () => {
  it('recomputes only the changed suffix values', () => {
    const records = [
      makeBubbleRecord(0, 10),
      makeBubbleRecord(1, 20),
      makeBubbleRecord(2, 30),
      makeBubbleRecord(3, 40),
    ]
    const prefixSums = buildPrefixSums(records)

    records[2] = makeBubbleRecord(2, 35.5)
    records[3] = makeBubbleRecord(3, 45.25)

    expect(rebuildPrefixSumsFromIndex(prefixSums, records, 2)).toEqual([10, 30, 65.5, 110.75])
    expect(prefixSums).toEqual([10, 30, 60, 100])
  })

  it('falls back to a full rebuild when records are empty', () => {
    expect(rebuildPrefixSumsFromIndex([], [], 0)).toEqual([])
  })

  it('falls back to a full rebuild when changedIndex is 0', () => {
    const records = [makeBubbleRecord(0, 20), makeBubbleRecord(1, 30)]
    const stalePrefixSums = [10, 30]

    expect(rebuildPrefixSumsFromIndex(stalePrefixSums, records, 0)).toEqual([20, 50])
  })

  it('falls back to a full rebuild when changedIndex equals records length', () => {
    const records = [makeBubbleRecord(0, 10), makeBubbleRecord(1, 20)]
    const prefixSums = buildPrefixSums(records)

    expect(rebuildPrefixSumsFromIndex(prefixSums, records, 2)).toEqual([10, 30])
  })

  it('falls back to a full rebuild when prefixSums and records lengths differ', () => {
    const records = [makeBubbleRecord(0, 10), makeBubbleRecord(1, 20)]
    const stalePrefixSums = [10]

    expect(rebuildPrefixSumsFromIndex(stalePrefixSums, records, 1)).toEqual([10, 30])
  })
})

describe('extendPrefixSums', () => {
  it('extends the existing cumulative heights with appended records', () => {
    const existingPrefixSums = [10, 30]
    const appendedRecords = [
      makeBubbleRecord(2, 5.5),
      makeBubbleRecord(3, 9.25),
    ]

    expect(extendPrefixSums(existingPrefixSums, appendedRecords)).toEqual([10, 30, 35.5, 44.75])
    expect(existingPrefixSums).toEqual([10, 30])
  })

  it('falls back to building prefix sums when the existing list is empty', () => {
    const appendedRecords = [
      makeBubbleRecord(0, 12),
      makeBubbleRecord(1, 8),
    ]

    expect(extendPrefixSums([], appendedRecords)).toEqual([12, 20])
  })
})
