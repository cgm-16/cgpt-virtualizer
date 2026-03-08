export interface BubbleRecord {
  index: number
  node: Element
  measuredHeight: number
  mounted: boolean
  pinned: boolean
}

export interface TranscriptSessionState {
  transcriptRoot: HTMLElement
  scrollContainer: HTMLElement
  records: BubbleRecord[]
  prefixSums: number[]
}

export function buildBubbleRecords(
  bubbles: Element[],
  measure: (node: Element) => number,
): BubbleRecord[] {
  return bubbles.map((node, index) => ({
    index,
    node,
    measuredHeight: measure(node),
    mounted: false,
    pinned: false,
  }))
}

export function createSessionState(
  transcriptRoot: HTMLElement,
  scrollContainer: HTMLElement,
  records: BubbleRecord[],
  prefixSums: number[],
): TranscriptSessionState {
  return {
    transcriptRoot,
    scrollContainer,
    records,
    prefixSums,
  }
}
