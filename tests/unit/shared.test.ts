import { describe, expect, it } from 'vitest'

import {
  ACTIVATION_BUBBLE_THRESHOLD,
  APPEND_QUIET_PERIOD_MS,
  NEAR_BOTTOM_THRESHOLD_PX,
} from '../../src/shared/constants.ts'
import {
  extractConversationId,
  isSupportedTranscriptPath,
  parseTranscriptPath,
} from '../../src/shared/routes.ts'

describe('shared constants', () => {
  it('exposes the locked V1 thresholds', () => {
    expect(ACTIVATION_BUBBLE_THRESHOLD).toBe(50)
    expect(APPEND_QUIET_PERIOD_MS).toBe(150)
    expect(NEAR_BOTTOM_THRESHOLD_PX).toBe(200)
  })
})

describe('transcript path parsing', () => {
  it('parses a supported transcript pathname', () => {
    expect(parseTranscriptPath('/c/abc123')).toEqual({
      conversationId: 'abc123',
      pathname: '/c/abc123',
    })
  })

  it('rejects unsupported pathnames', () => {
    expect(parseTranscriptPath('/')).toBeNull()
    expect(parseTranscriptPath('/c')).toBeNull()
    expect(parseTranscriptPath('/c/')).toBeNull()
    expect(parseTranscriptPath('/g/abc123')).toBeNull()
    expect(parseTranscriptPath('/share/abc123')).toBeNull()
  })

  it('detects whether a pathname is supported', () => {
    expect(isSupportedTranscriptPath('/c/abc123')).toBe(true)
    expect(isSupportedTranscriptPath('/g/abc123')).toBe(false)
  })

  it('extracts the conversation identifier from a supported pathname', () => {
    expect(extractConversationId('/c/abc123')).toBe('abc123')
    expect(extractConversationId('/g/abc123')).toBeNull()
  })
})
