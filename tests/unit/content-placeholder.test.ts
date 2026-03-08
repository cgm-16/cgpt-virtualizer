// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  clearStreamingPlaceholder,
  renderStreamingPlaceholder,
  resolveStreamingGapEdge,
} from '../../src/content/placeholder.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('resolveStreamingGapEdge', () => {
  it('returns bottom when the desired range extends below the mounted window', () => {
    expect(
      resolveStreamingGapEdge({ start: 0, end: 3 }, { start: 0, end: 6 }),
    ).toBe('bottom')
  })

  it('returns top when the desired range extends above the mounted window', () => {
    expect(
      resolveStreamingGapEdge({ start: 5, end: 8 }, { start: 2, end: 8 }),
    ).toBe('top')
  })

  it('returns null when the desired range stays inside the mounted window', () => {
    expect(
      resolveStreamingGapEdge({ start: 2, end: 8 }, { start: 3, end: 7 }),
    ).toBeNull()
  })
})

describe('streaming placeholder rendering', () => {
  it('renders and clears a placeholder at the requested spacer edge', () => {
    const fixture = makeSessionFixture()

    renderStreamingPlaceholder(fixture.sessionState, 'bottom')

    expect(
      fixture.transcriptRoot.querySelector('[data-cgpt-streaming-gap-placeholder]'),
    ).not.toBeNull()
    expect(
      fixture.transcriptRoot.querySelector('[data-cgpt-streaming-gap-edge=\"bottom\"]'),
    ).not.toBeNull()

    clearStreamingPlaceholder(fixture.sessionState)

    expect(
      fixture.transcriptRoot.querySelector('[data-cgpt-streaming-gap-placeholder]'),
    ).toBeNull()
  })
})

function makeSessionFixture(): {
  sessionState: TranscriptSessionState
  transcriptRoot: HTMLElement
} {
  document.body.innerHTML = ''

  const transcriptRoot = document.createElement('section')
  const scrollContainer = document.createElement('main')
  const bubble = document.createElement('article')

  transcriptRoot.append(bubble)
  scrollContainer.append(transcriptRoot)
  document.body.append(scrollContainer)

  const records: BubbleRecord[] = [
    {
      index: 0,
      measuredHeight: 100,
      mounted: true,
      node: bubble,
      pinned: false,
    },
  ]

  return {
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      isStreaming: false,
      mountedRange: { start: 0, end: 0 },
      pendingScrollCorrection: 0,
      prefixSums: [100],
      records,
      scrollContainer,
      transcriptRoot,
    },
    transcriptRoot,
  }
}
