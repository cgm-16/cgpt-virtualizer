import { captureAnchorSnapshot } from './anchor.ts'
import type { MutationObserverLike } from './append.ts'
import { clearStreamingPlaceholder } from './placeholder.ts'
import { buildPrefixSums } from './prefix-sums.ts'
import type { ResolvedContentSelectors } from './selectors.ts'
import {
  buildBubbleRecords,
  markAllRecordsMounted,
  type TranscriptSessionState,
} from './state.ts'

export type DirtyRebuildReason =
  | 'append-existing-node'
  | 'append-non-tail'
  | 'append-removal'
  | 'append-unmatched-node'
  | 'unsafe-structural-change'

export interface StructuralRebuildObserverManager {
  disconnect(): void
  flushPendingMutationRecords(): void
}

export interface StructuralRebuildObserverManagerDependencies {
  createMutationObserver(callback: MutationCallback): MutationObserverLike
  requestDirtyRebuild(state: TranscriptSessionState, reason: DirtyRebuildReason): void
}

export interface RunDirtyRebuildDependencies {
  detectStreamingState(document: Document, streamingIndicatorSelector: string): boolean
  disconnectObservers(): void
  document: Document
  handleSelectorFailure(): void
  measure(node: Element): number
  reconnectObservers(): void
  resolveSelectors(document: Document): ResolvedContentSelectors | null
  schedulePatch(options?: { force?: boolean }): boolean
}

export function requestDirtyRebuild(
  state: TranscriptSessionState,
  reason: DirtyRebuildReason,
): void {
  state.dirtyRebuildReason = reason
}

export function createStructuralRebuildObserverManager(
  state: TranscriptSessionState,
  dependencies: StructuralRebuildObserverManagerDependencies,
): StructuralRebuildObserverManager {
  const observer = dependencies.createMutationObserver((mutations) => {
    if (state.isStreaming || !shouldTriggerStructuralRebuild(state, mutations)) {
      return
    }

    dependencies.requestDirtyRebuild(state, 'unsafe-structural-change')
  })

  observer.observe(state.transcriptRoot, {
    characterData: true,
    childList: true,
    subtree: true,
  })

  return {
    disconnect() {
      observer.disconnect()
    },
    flushPendingMutationRecords() {
      observer.takeRecords()
    },
  }
}

export function runDirtyRebuild(
  state: TranscriptSessionState,
  reason: DirtyRebuildReason,
  dependencies: RunDirtyRebuildDependencies,
): boolean {
  state.dirtyRebuildReason = reason

  const rebuildAnchor = state.anchor ?? captureRebuildAnchor(state)
  const fallbackScrollTop = state.scrollContainer.scrollTop

  dependencies.disconnectObservers()

  const selectors = dependencies.resolveSelectors(dependencies.document)

  if (selectors === null) {
    dependencies.handleSelectorFailure()
    return false
  }

  const rebuiltNodes = rehydrateTranscriptRoot(state, selectors)

  state.transcriptRoot = selectors.transcriptRoot
  state.scrollContainer = selectors.scrollContainer
  state.records = buildBubbleRecords(rebuiltNodes, dependencies.measure)
  state.prefixSums = buildPrefixSums(state.records)
  state.mountedRange = null
  state.pendingScrollCorrection = 0
  state.anchor = null
  state.isStreaming = dependencies.detectStreamingState(
    dependencies.document,
    selectors.streamingIndicatorSelector,
  )

  if (state.isStreaming) {
    markAllRecordsMounted(state)
  }

  restoreScrollAfterRebuild(state, rebuildAnchor, fallbackScrollTop)
  state.dirtyRebuildReason = null

  dependencies.reconnectObservers()

  if (!state.isStreaming) {
    dependencies.schedulePatch({ force: true })
  }

  return true
}

export function destroyTranscriptSession(state: TranscriptSessionState): void {
  clearStreamingPlaceholder(state)
  state.transcriptRoot.replaceChildren(...state.records.map((record) => record.node))
  state.records = []
  state.prefixSums = []
  state.mountedRange = null
  state.anchor = null
  state.pendingScrollCorrection = 0
  state.dirtyRebuildReason = null
  state.isStreaming = false
}

function captureRebuildAnchor(
  state: TranscriptSessionState,
) {
  const viewportRect = state.scrollContainer.getBoundingClientRect()

  return captureAnchorSnapshot(state.records, {
    bottom: viewportRect.top + resolveViewportHeight(state.scrollContainer),
    top: viewportRect.top,
  })
}

function rehydrateTranscriptRoot(
  state: TranscriptSessionState,
  selectors: ResolvedContentSelectors,
): Element[] {
  const liveBubbles = Array.from(
    selectors.transcriptRoot.querySelectorAll(selectors.bubbleSelector),
  )
  const prefixNodes =
    state.mountedRange === null
      ? []
      : state.records.slice(0, state.mountedRange.start).map((record) => record.node)
  const suffixNodes =
    state.mountedRange === null
      ? []
      : state.records.slice(state.mountedRange.end + 1).map((record) => record.node)
  const rebuiltNodes = [...prefixNodes, ...liveBubbles, ...suffixNodes]

  selectors.transcriptRoot.replaceChildren(...rebuiltNodes)

  return rebuiltNodes
}

function restoreScrollAfterRebuild(
  state: TranscriptSessionState,
  rebuildAnchor: ReturnType<typeof captureRebuildAnchor>,
  fallbackScrollTop: number,
): void {
  if (rebuildAnchor === null) {
    state.scrollContainer.scrollTop = fallbackScrollTop
    return
  }

  const anchorIndex = state.records.findIndex((record) => record.node === rebuildAnchor.node)

  if (anchorIndex === -1) {
    state.scrollContainer.scrollTop = fallbackScrollTop
    return
  }

  const heightAboveAnchor = anchorIndex === 0 ? 0 : (state.prefixSums[anchorIndex - 1] ?? 0)

  state.scrollContainer.scrollTop = Math.max(0, heightAboveAnchor - rebuildAnchor.offset)
}

function shouldTriggerStructuralRebuild(
  state: TranscriptSessionState,
  mutations: readonly MutationRecord[],
): boolean {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      if (isInternalVirtualizerNode(mutation.target)) {
        continue
      }

      return true
    }

    if (mutation.type !== 'childList') {
      continue
    }

    if (mutation.target === state.transcriptRoot) {
      continue
    }

    if (isInternalVirtualizerNode(mutation.target)) {
      continue
    }

    return true
  }

  return false
}

function isInternalVirtualizerNode(node: Node): boolean {
  const element =
    node instanceof Element
      ? node
      : node.parentElement

  if (element === null) {
    return false
  }

  return (
    element.closest('[data-cgpt-top-spacer]') !== null ||
    element.closest('[data-cgpt-bottom-spacer]') !== null ||
    element.closest('[data-cgpt-streaming-gap-placeholder]') !== null
  )
}

function resolveViewportHeight(scrollContainer: HTMLElement): number {
  return scrollContainer.clientHeight || scrollContainer.getBoundingClientRect().height
}
