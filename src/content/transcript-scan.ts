import { ACTIVATION_BUBBLE_THRESHOLD } from '../shared/constants.ts'
import type { ResolvedContentSelectors } from './selectors.ts'

export interface TranscriptScanResult {
  transcriptRoot: HTMLElement
  bubbles: Element[]
  bubbleCount: number
  activationEligible: boolean
}

export function collectTranscriptBubbles(root: HTMLElement, bubbleSelector: string): Element[] {
  return Array.from(root.querySelectorAll(bubbleSelector))
}

export function isActivationEligible(bubbleCount: number): boolean {
  return bubbleCount >= ACTIVATION_BUBBLE_THRESHOLD
}

export function scanTranscript(selectors: ResolvedContentSelectors): TranscriptScanResult {
  const bubbles = collectTranscriptBubbles(selectors.transcriptRoot, selectors.bubbleSelector)
  const bubbleCount = bubbles.length

  return {
    transcriptRoot: selectors.transcriptRoot,
    bubbles,
    bubbleCount,
    activationEligible: isActivationEligible(bubbleCount),
  }
}
