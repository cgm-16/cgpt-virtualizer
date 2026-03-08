// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { bootstrapContentScript } from '../../src/content/bootstrap.ts'
import { resolveAvailability } from '../../src/content/availability.ts'
import {
  CONTENT_SELECTOR_REGISTRY,
  resolveSelectors,
} from '../../src/content/selectors.ts'

describe('content availability', () => {
  it('treats unsupported routes as idle', () => {
    expect(resolveAvailability('/g/example', null)).toBe('idle')
  })

  it('treats supported routes with missing selectors as unavailable', () => {
    expect(resolveAvailability('/c/example', null)).toBe('unavailable')
  })

  it('treats supported routes with resolved selectors as available', () => {
    expect(
      resolveAvailability('/c/example', {
        bubbleSelector: CONTENT_SELECTOR_REGISTRY.bubble,
        scrollContainer: {} as HTMLElement,
        streamingIndicatorSelector: CONTENT_SELECTOR_REGISTRY.streamingIndicator,
        transcriptRoot: {} as HTMLElement,
      }),
    ).toBe('available')
  })
})

describe('selector resolution', () => {
  it('returns null when required selectors are missing', () => {
    const document = {
      querySelector() {
        return null
      },
    } as unknown as Document

    expect(resolveSelectors(document)).toBeNull()
  })

  it('skips selector lookup on unsupported routes', () => {
    const reports: unknown[] = []
    const document = {
      querySelector() {
        throw new Error('비대상 경로에서 선택자를 조회하면 안 됩니다.')
      },
    } as unknown as Document

    const result = bootstrapContentScript({
      document,
      pathname: '/g/example',
      reportAvailability(message) {
        reports.push(message)
      },
    })

    expect(result.availability).toBe('idle')
    expect(result.scanResult).toBeNull()
    expect(result.sessionState).toBeNull()

    expect(reports).toEqual([
      {
        availability: 'idle',
        type: 'runtime/report-content-availability',
      },
    ])
  })
})

function createNoopResizeObserver() {
  return {
    disconnect() {},
    observe() {},
    unobserve() {},
  }
}

function makeDocumentWithBubbles(bubbleCount: number): Document {
  const transcriptRoot = document.createElement('section')
  transcriptRoot.setAttribute('data-cgpt-transcript-root', '')

  for (let i = 0; i < bubbleCount; i++) {
    const bubble = document.createElement('article')
    bubble.setAttribute('data-cgpt-transcript-bubble', '')
    transcriptRoot.append(bubble)
  }

  const scrollContainer = document.createElement('main')
  scrollContainer.setAttribute('data-cgpt-scroll-container', '')

  const body = document.createElement('body')
  body.append(scrollContainer, transcriptRoot)

  return {
    querySelector(selector: string) {
      return body.querySelector(selector)
    },
  } as unknown as Document
}

describe('transcript scan integration', () => {
  it('returns null scanResult for unsupported routes', () => {
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(50),
      pathname: '/g/example',
      reportAvailability() {},
    })

    expect(result.scanResult).toBeNull()
    expect(result.sessionState).toBeNull()
  })

  it('returns null scanResult when selectors are missing', () => {
    const emptyDoc = { querySelector() { return null } } as unknown as Document

    const result = bootstrapContentScript({
      document: emptyDoc,
      pathname: '/c/example',
      reportAvailability() {},
    })

    expect(result.availability).toBe('unavailable')
    expect(result.scanResult).toBeNull()
    expect(result.sessionState).toBeNull()
  })

  it('returns scanResult with activationEligible=false for 0 bubbles', () => {
    const reports: unknown[] = []
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(0),
      pathname: '/c/example',
      reportAvailability(message) {
        reports.push(message)
      },
    })

    expect(result.availability).toBe('inactive')
    expect(result.scanResult).not.toBeNull()
    expect(result.sessionState).toBeNull()
    expect(result.scanResult?.bubbleCount).toBe(0)
    expect(result.scanResult?.activationEligible).toBe(false)
    expect(reports).toEqual([
      {
        availability: 'inactive',
        type: 'runtime/report-content-availability',
      },
    ])
  })

  it('returns scanResult with activationEligible=false for 49 bubbles', () => {
    const reports: unknown[] = []
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(49),
      pathname: '/c/example',
      reportAvailability(message) {
        reports.push(message)
      },
    })

    expect(result.availability).toBe('inactive')
    expect(result.sessionState).toBeNull()
    expect(result.scanResult?.bubbleCount).toBe(49)
    expect(result.scanResult?.activationEligible).toBe(false)
    expect(reports).toEqual([
      {
        availability: 'inactive',
        type: 'runtime/report-content-availability',
      },
    ])
  })

  it('returns scanResult with activationEligible=true for 50 bubbles', () => {
    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: makeDocumentWithBubbles(50),
      pathname: '/c/example',
      reportAvailability() {},
    })

    expect(result.availability).toBe('available')
    expect(result.scanResult?.bubbleCount).toBe(50)
    expect(result.scanResult?.activationEligible).toBe(true)
  })

  it('creates ordered session state with measured heights for eligible transcripts', () => {
    const bubbleHeights = Array.from({ length: 50 }, (_, index) => index + 0.5)
    const fixture = makeMeasuredDocumentFixture(bubbleHeights, {
      viewportHeight: 2_500,
    })

    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: fixture.document,
      pathname: '/c/example',
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0)
        return 1
      },
    })

    expect(result.availability).toBe('available')
    expect(result.sessionState).not.toBeNull()
    expect(result.sessionState?.transcriptRoot).toBe(fixture.transcriptRoot)
    expect(result.sessionState?.scrollContainer).toBe(fixture.scrollContainer)
    expect(result.sessionState?.mountedRange).toEqual({ start: 0, end: 49 })
    expect(result.sessionState?.records).toHaveLength(50)
    expect(result.sessionState?.records[0]).toMatchObject({
      index: 0,
      measuredHeight: 0.5,
      mounted: true,
      pinned: false,
    })
    expect(result.sessionState?.records[1]).toMatchObject({
      index: 1,
      measuredHeight: 1.5,
      mounted: true,
      pinned: false,
    })
    expect(result.sessionState?.records[49]).toMatchObject({
      index: 49,
      measuredHeight: 49.5,
      mounted: true,
      pinned: false,
    })
    expect(result.sessionState?.records[0]?.node).toBe(fixture.bubbles[0])
    expect(result.sessionState?.records[1]?.node).toBe(fixture.bubbles[1])
    expect(result.sessionState?.records[49]?.node).toBe(fixture.bubbles[49])
    expect(result.sessionState?.prefixSums[0]).toBe(0.5)
    expect(result.sessionState?.prefixSums[1]).toBe(2)
    expect(result.sessionState?.prefixSums[49]).toBe(1250)
    expect(Array.from(fixture.transcriptRoot.children).at(0)).toBe(
      fixture.transcriptRoot.querySelector('[data-cgpt-top-spacer]'),
    )
    expect(Array.from(fixture.transcriptRoot.children).at(-1)).toBe(
      fixture.transcriptRoot.querySelector('[data-cgpt-bottom-spacer]'),
    )
  })

  it('computes an initial mounted range from the scroll viewport instead of mounting the full transcript', () => {
    const bubbleHeights = Array.from({ length: 50 }, () => 100)
    const fixture = makeMeasuredDocumentFixture(bubbleHeights, {
      viewportHeight: 200,
    })

    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: fixture.document,
      pathname: '/c/example',
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0)
        return 1
      },
    })

    expect(result.sessionState?.mountedRange).toEqual({ start: 0, end: 3 })
    expect(result.sessionState?.records.slice(0, 4).every((record) => record.mounted)).toBe(true)
    expect(result.sessionState?.records.slice(4).every((record) => !record.mounted)).toBe(true)
    expect(Array.from(fixture.transcriptRoot.children)).toHaveLength(6)
  })
})

function makeMeasuredDocumentFixture(bubbleHeights: number[]): {
  bubbles: HTMLElement[]
  document: Document
  scrollContainer: HTMLElement
  transcriptRoot: HTMLElement
}
function makeMeasuredDocumentFixture(
  bubbleHeights: number[],
  options: {
    viewportHeight: number
  },
): {
  bubbles: HTMLElement[]
  document: Document
  scrollContainer: HTMLElement
  transcriptRoot: HTMLElement
} {
  const transcriptRoot = document.createElement('section')
  transcriptRoot.setAttribute('data-cgpt-transcript-root', '')
  const scrollContainer = document.createElement('main')
  scrollContainer.setAttribute('data-cgpt-scroll-container', '')
  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: options.viewportHeight,
  })
  const bubbles = bubbleHeights.map((height) => {
    const bubble = document.createElement('article')
    bubble.setAttribute('data-cgpt-transcript-bubble', '')
    bubble.getBoundingClientRect = () => ({ height }) as DOMRect
    transcriptRoot.append(bubble)
    return bubble
  })
  const streamingIndicator = document.createElement('div')
  streamingIndicator.setAttribute('data-cgpt-streaming-indicator', '')
  streamingIndicator.setAttribute('hidden', '')

  const body = document.createElement('body')
  scrollContainer.append(transcriptRoot)
  body.append(scrollContainer, streamingIndicator)

  return {
    bubbles,
    document: {
      querySelector(selector: string) {
        return body.querySelector(selector)
      },
    } as unknown as Document,
    scrollContainer,
    transcriptRoot,
  }
}
