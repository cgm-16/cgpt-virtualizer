// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  assertMountedWindowBounds,
  recordVirtualizationMetrics,
  reportVirtualizationMetrics,
} from '../../src/content/debug.ts'
import { patchMountedRange } from '../../src/content/patch.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('recordVirtualizationMetrics', () => {
  it('현재 mounted window metrics를 계산한다', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100])

    patchMountedRange(fixture.sessionState, 1, 2)
    fixture.scrollContainer.scrollTop = 150

    expect(recordVirtualizationMetrics(fixture.sessionState)).toEqual({
      bottomSpacerHeight: 100,
      detachedNodeCount: 2,
      directChildCount: 4,
      estimatedDetachedHeight: 200,
      isStreaming: false,
      mountedBubbleCount: 2,
      mountedRange: { end: 2, start: 1 },
      mountedWindowHeight: 200,
      scrollTop: 150,
      topSpacerHeight: 100,
      totalBubbleCount: 4,
      totalHeight: 400,
      viewportHeight: 200,
    })
  })
})

describe('assertMountedWindowBounds', () => {
  it('mounted range 밖 bubble이 direct child로 남아 있으면 실패한다', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100])

    patchMountedRange(fixture.sessionState, 1, 2)
    fixture.transcriptRoot.insertBefore(
      fixture.records[0]!.node,
      fixture.transcriptRoot.querySelector('[data-cgpt-bottom-spacer]'),
    )

    expect(() => {
      assertMountedWindowBounds(fixture.sessionState, 1, 2)
    }).toThrow('Mounted window bubble 수가 기대 범위를 벗어났습니다.')
  })
})

describe('reportVirtualizationMetrics', () => {
  it('debug storage flag가 켜져 있을 때만 metrics를 기록한다', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100])
    const sink = vi.fn()

    patchMountedRange(fixture.sessionState, 0, 1)

    expect(
      reportVirtualizationMetrics('patch-applied', fixture.sessionState, {
        sink,
        storage: { getItem: () => '1' },
      }),
    ).toEqual(
      expect.objectContaining({
        mountedBubbleCount: 2,
        mountedRange: { end: 1, start: 0 },
      }),
    )
    expect(sink).toHaveBeenCalledWith(
      '[cgpt-virtualizer]',
      'patch-applied',
      expect.objectContaining({
        mountedBubbleCount: 2,
        mountedRange: { end: 1, start: 0 },
      }),
    )

    sink.mockClear()

    expect(
      reportVirtualizationMetrics('patch-applied', fixture.sessionState, {
        sink,
        storage: { getItem: () => null },
      }),
    ).toBeNull()
    expect(sink).not.toHaveBeenCalled()
  })
})

function makeSessionFixture(
  heights: number[],
): {
  records: BubbleRecord[]
  scrollContainer: HTMLElement
  sessionState: TranscriptSessionState
  transcriptRoot: HTMLElement
} {
  document.body.innerHTML = ''

  const transcriptRoot = document.createElement('section')
  const scrollContainer = document.createElement('main')
  const records = heights.map((height, index): BubbleRecord => {
    const node = document.createElement('article')

    node.textContent = `Bubble ${index}`
    transcriptRoot.append(node)

    return {
      index,
      measuredHeight: height,
      mounted: true,
      node,
      pinned: false,
    }
  })

  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: 200,
  })
  scrollContainer.getBoundingClientRect = () =>
    ({
      height: 200,
      top: 0,
    }) as DOMRect
  scrollContainer.scrollTop = 0
  scrollContainer.append(transcriptRoot)
  document.body.append(scrollContainer)

  return {
    records,
    scrollContainer,
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      isStreaming: false,
      mountedRange: null,
      pendingScrollCorrection: 0,
      prefixSums: buildPrefixSums(heights),
      records,
      scrollContainer,
      transcriptRoot,
    },
    transcriptRoot,
  }
}

function buildPrefixSums(heights: number[]): number[] {
  return heights.reduce<number[]>((prefixSums, height) => {
    const previous = prefixSums[prefixSums.length - 1] ?? 0

    prefixSums.push(previous + height)
    return prefixSums
  }, [])
}
