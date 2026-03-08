// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { captureAnchorSnapshot } from '../../src/content/anchor.ts'
import {
  createResizeObserverManager,
  shouldIgnoreHeightDelta,
} from '../../src/content/resize.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('shouldIgnoreHeightDelta', () => {
  it('ignores height drift smaller than 1px', () => {
    expect(shouldIgnoreHeightDelta(100, 100.99)).toBe(true)
    expect(shouldIgnoreHeightDelta(100, 99.25)).toBe(true)
  })

  it('keeps 1px or larger height changes', () => {
    expect(shouldIgnoreHeightDelta(100, 101)).toBe(false)
    expect(shouldIgnoreHeightDelta(100, 98.5)).toBe(false)
  })
})

describe('createResizeObserverManager', () => {
  it('observes only mounted records and unobserves detached ones on refresh', () => {
    const fixture = makeSessionFixture([100, 100, 100])
    const observe = vi.fn()
    const unobserve = vi.fn()
    let callback: ResizeObserverCallback | null = null

    fixture.sessionState.records[0]!.mounted = true
    fixture.sessionState.records[1]!.mounted = true

    const manager = createResizeObserverManager(fixture.sessionState, {
      applyPendingCorrection() {},
      createResizeObserver(nextCallback) {
        callback = nextCallback

        return {
          disconnect() {},
          observe,
          unobserve,
        }
      },
      measure(node) {
        return fixture.heights.get(node) ?? 0
      },
      schedulePatch() {
        return false
      },
    })

    manager.refreshObservedRecords()

    expect(observe).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenNthCalledWith(1, fixture.bubbles[0])
    expect(observe).toHaveBeenNthCalledWith(2, fixture.bubbles[1])
    expect(callback).not.toBeNull()

    fixture.sessionState.records[1]!.mounted = false
    fixture.transcriptRoot.removeChild(fixture.bubbles[1]!)

    manager.refreshObservedRecords()

    expect(unobserve).toHaveBeenCalledTimes(1)
    expect(unobserve).toHaveBeenCalledWith(fixture.bubbles[1])
  })

  it('updates measured height and prefix sums, then applies anchor correction when no patch is queued', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100, 100], {
      scrollTop: 250,
      viewportHeight: 200,
      viewportTop: 50,
    })
    let callback: ResizeObserverCallback | null = null

    for (const record of fixture.sessionState.records) {
      record.mounted = true
    }

    fixture.sessionState.mountedRange = { start: 0, end: 4 }
    fixture.sessionState.anchor = captureAnchorSnapshot(fixture.sessionState.records, {
      bottom: 250,
      top: 50,
    })

    const manager = createResizeObserverManager(fixture.sessionState, {
      applyPendingCorrection() {
        fixture.scrollContainer.scrollTop += fixture.sessionState.pendingScrollCorrection
        fixture.sessionState.pendingScrollCorrection = 0
        fixture.sessionState.anchor = captureAnchorSnapshot(fixture.sessionState.records, {
          bottom: 250,
          top: 50,
        })
      },
      createResizeObserver(nextCallback) {
        callback = nextCallback

        return {
          disconnect() {},
          observe() {},
          unobserve() {},
        }
      },
      measure(node) {
        return fixture.heights.get(node) ?? 0
      },
      schedulePatch() {
        return false
      },
    })

    manager.refreshObservedRecords()
    fixture.heights.set(fixture.bubbles[0], 125)

    callback?.(
      [
        {
          target: fixture.bubbles[0],
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    )

    expect(fixture.sessionState.records[0]?.measuredHeight).toBe(125)
    expect(fixture.sessionState.prefixSums).toEqual([125, 225, 325, 425, 525])
    expect(fixture.scrollContainer.scrollTop).toBe(275)
    expect(fixture.sessionState.pendingScrollCorrection).toBe(0)
    expect(fixture.sessionState.anchor?.index).toBe(2)
  })

  it('queues a patch instead of applying correction immediately when resize changes need a remount check', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100])
    let callback: ResizeObserverCallback | null = null
    const applyPendingCorrection = vi.fn()
    const schedulePatch = vi.fn(() => true)

    fixture.sessionState.records[0]!.mounted = true
    fixture.sessionState.records[1]!.mounted = true
    fixture.sessionState.mountedRange = { start: 0, end: 1 }

    const manager = createResizeObserverManager(fixture.sessionState, {
      applyPendingCorrection,
      createResizeObserver(nextCallback) {
        callback = nextCallback

        return {
          disconnect() {},
          observe() {},
          unobserve() {},
        }
      },
      measure(node) {
        return fixture.heights.get(node) ?? 0
      },
      schedulePatch,
    })

    manager.refreshObservedRecords()
    fixture.heights.set(fixture.bubbles[0], 140)

    callback?.(
      [
        {
          target: fixture.bubbles[0],
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    )

    expect(schedulePatch).toHaveBeenCalledTimes(1)
    expect(applyPendingCorrection).not.toHaveBeenCalled()
  })
})

function makeSessionFixture(
  heights: number[],
  options: {
    scrollTop?: number
    viewportHeight?: number
    viewportTop?: number
  } = {},
): {
  bubbles: HTMLElement[]
  heights: Map<Element, number>
  scrollContainer: HTMLElement
  sessionState: TranscriptSessionState
  transcriptRoot: HTMLElement
} {
  document.body.innerHTML = ''

  const transcriptRoot = document.createElement('section')
  const scrollContainer = document.createElement('main')
  const prefixSums = buildPrefixSums(heights)
  const measuredHeights = new Map<Element, number>()
  const bubbles = heights.map((height, index) => {
    const bubble = document.createElement('article')
    const top = index === 0 ? 0 : (prefixSums[index - 1] ?? 0)

    measuredHeights.set(bubble, height)
    bubble.textContent = `Bubble ${index}`
    bubble.getBoundingClientRect = () => {
      const nextHeight = measuredHeights.get(bubble) ?? height
      const topOffset = options.viewportTop ?? 0

      return {
        bottom: topOffset + top - scrollContainer.scrollTop + nextHeight,
        height: nextHeight,
        top: topOffset + top - scrollContainer.scrollTop,
      } as DOMRect
    }
    transcriptRoot.append(bubble)
    return bubble
  })
  const records = bubbles.map((bubble, index): BubbleRecord => ({
    index,
    measuredHeight: heights[index]!,
    mounted: false,
    node: bubble,
    pinned: false,
  }))

  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: options.viewportHeight ?? 200,
  })

  scrollContainer.scrollTop = options.scrollTop ?? 0
  scrollContainer.getBoundingClientRect = () =>
    ({
      height: options.viewportHeight ?? 200,
      top: options.viewportTop ?? 0,
    }) as DOMRect

  scrollContainer.append(transcriptRoot)
  document.body.append(scrollContainer)

  return {
    bubbles,
    heights: measuredHeights,
    scrollContainer,
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      mountedRange: null,
      pendingScrollCorrection: 0,
      prefixSums,
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
