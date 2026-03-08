// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  accumulateScrollCorrection,
  captureAnchorSnapshot,
} from '../../src/content/anchor.ts'
import { applyMountedRangeUpdate } from '../../src/content/scroll.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('applyMountedRangeUpdate', () => {
  it('captures the first intersecting mounted bubble after patching', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100], {
      scrollTop: 0,
      viewportHeight: 100,
      viewportTop: 50,
    })

    applyMountedRangeUpdate(fixture.sessionState, { start: 0, end: 2 })

    expect(fixture.sessionState.mountedRange).toEqual({ start: 0, end: 2 })
    expect(fixture.sessionState.anchor).toEqual({
      index: 0,
      node: fixture.bubbles[0],
      offset: 0,
    })
  })

  it('applies accumulated correction during the patch frame when the anchor survives', () => {
    const fixture = makeSessionFixture([100, 100, 100, 100, 100], {
      scrollTop: 0,
      viewportHeight: 100,
      viewportTop: 50,
    })

    applyMountedRangeUpdate(fixture.sessionState, { start: 0, end: 3 })

    fixture.scrollContainer.scrollTop = 250

    const currentAnchor = captureAnchorSnapshot(fixture.sessionState.records, {
      top: 50,
      bottom: 150,
    })

    fixture.sessionState.pendingScrollCorrection = accumulateScrollCorrection(
      0,
      currentAnchor,
      0,
      25,
    )

    applyMountedRangeUpdate(fixture.sessionState, { start: 1, end: 4 })

    expect(fixture.scrollContainer.scrollTop).toBe(275)
    expect(fixture.sessionState.pendingScrollCorrection).toBe(0)
    expect(fixture.sessionState.anchor?.index).toBe(2)
  })
})

function makeSessionFixture(
  heights: number[],
  options: {
    scrollTop: number
    viewportHeight: number
    viewportTop: number
  },
): {
  bubbles: HTMLElement[]
  scrollContainer: HTMLElement
  sessionState: TranscriptSessionState
} {
  document.body.innerHTML = ''

  const transcriptRoot = document.createElement('section')
  const scrollContainer = document.createElement('main')
  const prefixSums = buildPrefixSums(heights)
  const bubbles = heights.map((height, index) => {
    const bubble = document.createElement('article')
    const top = index === 0 ? 0 : (prefixSums[index - 1] ?? 0)

    bubble.textContent = `Bubble ${index}`
    bubble.getBoundingClientRect = () =>
      ({
        bottom: options.viewportTop + top - scrollContainer.scrollTop + height,
        height,
        top: options.viewportTop + top - scrollContainer.scrollTop,
      }) as DOMRect
    transcriptRoot.append(bubble)
    return bubble
  })
  const records = bubbles.map((bubble, index): BubbleRecord => ({
    index,
    measuredHeight: heights[index],
    mounted: false,
    node: bubble,
    pinned: false,
  }))

  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: options.viewportHeight,
  })

  scrollContainer.scrollTop = options.scrollTop
  scrollContainer.getBoundingClientRect = () =>
    ({
      height: options.viewportHeight,
      top: options.viewportTop,
    }) as DOMRect

  scrollContainer.append(transcriptRoot)
  document.body.append(scrollContainer)

  return {
    bubbles,
    scrollContainer,
    sessionState: {
      anchor: null,
      mountedRange: null,
      pendingScrollCorrection: 0,
      prefixSums,
      records,
      scrollContainer,
      transcriptRoot,
    },
  }
}

function buildPrefixSums(heights: number[]): number[] {
  return heights.reduce<number[]>((prefixSums, height) => {
    const previous = prefixSums[prefixSums.length - 1] ?? 0

    prefixSums.push(previous + height)
    return prefixSums
  }, [])
}
