import type { AnchorSnapshot } from './anchor.ts'
import type { DirtyRebuildReason } from './rebuild.ts'

export interface BubbleRecord {
  index: number
  node: Element
  measuredHeight: number
  mounted: boolean
  pinned: boolean
}

export interface MountedRange {
  start: number
  end: number
}

export interface TranscriptSessionState {
  transcriptRoot: HTMLElement
  scrollContainer: HTMLElement
  records: BubbleRecord[]
  prefixSums: number[]
  mountedRange: MountedRange | null
  isStreaming: boolean
  anchor: AnchorSnapshot | null
  dirtyRebuildReason: DirtyRebuildReason | null
  pendingScrollCorrection: number
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

export function markAllRecordsMounted(state: TranscriptSessionState): void {
  for (const record of state.records) {
    record.mounted = true
  }

  state.mountedRange =
    state.records.length === 0
      ? null
      : { start: 0, end: state.records.length - 1 }
}
