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

    expect(
      bootstrapContentScript({
        document,
        pathname: '/g/example',
        reportAvailability(message) {
          reports.push(message)
        },
      }),
    ).toBe('idle')

    expect(reports).toEqual([
      {
        availability: 'idle',
        type: 'runtime/report-content-availability',
      },
    ])
  })
})
