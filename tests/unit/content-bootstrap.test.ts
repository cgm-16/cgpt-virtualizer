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

    expect(reports).toEqual([
      {
        availability: 'idle',
        type: 'runtime/report-content-availability',
      },
    ])
  })
})

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
  })

  it('returns scanResult with activationEligible=false for 0 bubbles', () => {
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(0),
      pathname: '/c/example',
      reportAvailability() {},
    })

    expect(result.availability).toBe('available')
    expect(result.scanResult).not.toBeNull()
    expect(result.scanResult?.bubbleCount).toBe(0)
    expect(result.scanResult?.activationEligible).toBe(false)
  })

  it('returns scanResult with activationEligible=false for 49 bubbles', () => {
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(49),
      pathname: '/c/example',
      reportAvailability() {},
    })

    expect(result.availability).toBe('available')
    expect(result.scanResult?.bubbleCount).toBe(49)
    expect(result.scanResult?.activationEligible).toBe(false)
  })

  it('returns scanResult with activationEligible=true for 50 bubbles', () => {
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(50),
      pathname: '/c/example',
      reportAvailability() {},
    })

    expect(result.availability).toBe('available')
    expect(result.scanResult?.bubbleCount).toBe(50)
    expect(result.scanResult?.activationEligible).toBe(true)
  })
})
