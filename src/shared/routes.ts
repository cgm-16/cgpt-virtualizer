import type { TranscriptPathMatch, TranscriptSessionId } from './types.ts'

const TRANSCRIPT_PATH_PATTERN = /^\/c\/([^/]+)$/

export function parseTranscriptPath(pathname: string): TranscriptPathMatch | null {
  const match = TRANSCRIPT_PATH_PATTERN.exec(pathname)

  if (match === null) {
    return null
  }

  const conversationId = match[1] as TranscriptSessionId

  return {
    conversationId,
    pathname,
  }
}

export function isSupportedTranscriptPath(pathname: string): boolean {
  return parseTranscriptPath(pathname) !== null
}

export function extractConversationId(pathname: string): TranscriptSessionId | null {
  return parseTranscriptPath(pathname)?.conversationId ?? null
}
