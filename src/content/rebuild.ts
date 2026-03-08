import type { TranscriptSessionState } from './state.ts'

export type DirtyRebuildReason =
  | 'append-existing-node'
  | 'append-non-tail'
  | 'append-removal'
  | 'append-unmatched-node'

export function requestDirtyRebuild(
  state: TranscriptSessionState,
  reason: DirtyRebuildReason,
): void {
  state.dirtyRebuildReason = reason
}
