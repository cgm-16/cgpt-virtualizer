import { ACTIVATION_BUBBLE_THRESHOLD } from './shared/constants.ts'
import { parseTranscriptPath } from './shared/routes.ts'

const transcriptPath = parseTranscriptPath(window.location.pathname)

// 콘텐츠 스크립트 진입점
console.log('cgpt-virtualizer content loaded', {
  activationBubbleThreshold: ACTIVATION_BUBBLE_THRESHOLD,
  transcriptPath,
})
