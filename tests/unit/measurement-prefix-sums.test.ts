// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { measureBubble } from '../../src/content/measure.ts'
import {
  buildPrefixSums,
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
})
