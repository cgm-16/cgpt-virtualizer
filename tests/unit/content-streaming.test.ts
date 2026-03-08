// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { detectStreamingState } from '../../src/content/streaming.ts'

describe('detectStreamingState', () => {
  it('returns false when the indicator is missing', () => {
    document.body.innerHTML = ''

    expect(detectStreamingState(document, '[data-cgpt-streaming-indicator]')).toBe(false)
  })

  it('returns true when the indicator is visible', () => {
    document.body.innerHTML = '<div data-cgpt-streaming-indicator></div>'

    expect(detectStreamingState(document, '[data-cgpt-streaming-indicator]')).toBe(true)
  })

  it('returns false when the indicator is hidden', () => {
    document.body.innerHTML = '<div data-cgpt-streaming-indicator hidden></div>'

    expect(detectStreamingState(document, '[data-cgpt-streaming-indicator]')).toBe(false)
  })
})
