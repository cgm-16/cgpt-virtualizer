import { createReportContentAvailabilityMessage } from '../shared/messages.ts'
import type { ContentAvailability } from '../shared/types.ts'
import { isSupportedTranscriptPath } from '../shared/routes.ts'
import {
  createAppendObserverManager,
  type MutationObserverLike,
} from './append.ts'
import { resolveAvailability } from './availability.ts'
import { measureBubble } from './measure.ts'
import { clearStreamingPlaceholder } from './placeholder.ts'
import { buildPrefixSums } from './prefix-sums.ts'
import { requestDirtyRebuild } from './rebuild.ts'
import {
  createResizeObserverManager,
  type ResizeObserverLike,
} from './resize.ts'
import {
  applyPendingAnchorCorrection,
  initializeScrollVirtualization,
} from './scroll.ts'
import { resolveSelectors } from './selectors.ts'
import {
  buildBubbleRecords,
  type TranscriptSessionState,
} from './state.ts'
import {
  createStreamingObserverManager,
  detectStreamingState,
} from './streaming.ts'
import { scanTranscript, type TranscriptScanResult } from './transcript-scan.ts'

export interface ContentBootstrapDependencies {
  clearTimeout?(handle: number): void
  createMutationObserver?(callback: MutationCallback): MutationObserverLike
  createResizeObserver?(callback: ResizeObserverCallback): ResizeObserverLike
  document: Document
  pathname: string
  reportAvailability(message: ReturnType<typeof createReportContentAvailabilityMessage>): void
  requestAnimationFrame?(callback: FrameRequestCallback): number
  setTimeout?(callback: () => void, delay: number): number
}

export interface ContentBootstrapResult {
  availability: ContentAvailability
  scanResult: TranscriptScanResult | null
  sessionState: TranscriptSessionState | null
}

export function bootstrapContentScript(
  dependencies: ContentBootstrapDependencies = createDefaultDependencies(),
): ContentBootstrapResult {
  const selectors = isSupportedTranscriptPath(dependencies.pathname)
    ? resolveSelectors(dependencies.document)
    : null
  const scanResult = selectors !== null ? scanTranscript(selectors) : null
  const baseAvailability = resolveAvailability(dependencies.pathname, selectors)
  const availability =
    baseAvailability === 'available' && scanResult !== null && !scanResult.activationEligible
      ? 'inactive'
      : baseAvailability
  const sessionState =
    availability === 'available' && selectors !== null && scanResult !== null
      ? createTranscriptSessionState(selectors.scrollContainer, scanResult)
      : null

  if (sessionState !== null && selectors !== null) {
    let appendObserverManager: ReturnType<typeof createAppendObserverManager> | null = null
    let resizeObserverManager: ReturnType<typeof createResizeObserverManager> | null = null
    let streamingObserverManager: ReturnType<typeof createStreamingObserverManager> | null = null

    sessionState.isStreaming = detectStreamingState(
      dependencies.document,
      selectors.streamingIndicatorSelector,
    )

    if (sessionState.isStreaming) {
      markAllRecordsMounted(sessionState)
    }

    const scrollController = initializeScrollVirtualization(sessionState, {
      afterPatch() {
        appendObserverManager?.flushPendingMutationRecords()
        resizeObserverManager?.refreshObservedRecords()
      },
      requestAnimationFrame: dependencies.requestAnimationFrame ?? window.requestAnimationFrame.bind(window),
    })
    resizeObserverManager = createResizeObserverManager(sessionState, {
      applyPendingCorrection() {
        applyPendingAnchorCorrection(sessionState)
      },
      createResizeObserver:
        dependencies.createResizeObserver ?? ((callback) => new ResizeObserver(callback)),
      measure: measureBubble,
      schedulePatch() {
        return scrollController.schedulePatch()
      },
    })
    appendObserverManager = createAppendObserverManager(sessionState, {
      clearTimeout: dependencies.clearTimeout ?? window.clearTimeout.bind(window),
      createMutationObserver:
        dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
      isTranscriptBubble(node): node is Element {
        return node instanceof Element && node.matches(selectors.bubbleSelector)
      },
      measure: measureBubble,
      requestDirtyRebuild,
      schedulePatch(options) {
        return scrollController.schedulePatch(options)
      },
      setTimeout: dependencies.setTimeout ?? window.setTimeout.bind(window),
    })
    streamingObserverManager = createStreamingObserverManager({
      createMutationObserver:
        dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
      document: dependencies.document,
      onStreamingChange(nextIsStreaming) {
        sessionState.isStreaming = nextIsStreaming

        if (nextIsStreaming) {
          return
        }

        clearStreamingPlaceholder(sessionState)
        appendObserverManager?.flushPendingAppends()
        scrollController.schedulePatch({ force: true })
      },
      streamingIndicatorSelector: selectors.streamingIndicatorSelector,
    })
    resizeObserverManager.refreshObservedRecords()
    streamingObserverManager.sync()
  }

  dependencies.reportAvailability(createReportContentAvailabilityMessage(availability))

  return { availability, scanResult, sessionState }
}

function createDefaultDependencies(): ContentBootstrapDependencies {
  return {
    document,
    pathname: window.location.pathname,
    reportAvailability(message) {
      chrome.runtime.sendMessage(message)
    },
    requestAnimationFrame(callback) {
      return window.requestAnimationFrame(callback)
    },
  }
}

function createTranscriptSessionState(
  scrollContainer: HTMLElement,
  scanResult: TranscriptScanResult,
): TranscriptSessionState {
  const records = buildBubbleRecords(scanResult.bubbles, measureBubble)

  return {
    anchor: null,
    dirtyRebuildReason: null,
    isStreaming: false,
    transcriptRoot: scanResult.transcriptRoot,
    pendingScrollCorrection: 0,
    scrollContainer,
    records,
    prefixSums: buildPrefixSums(records),
    mountedRange: null,
  }
}

function markAllRecordsMounted(state: TranscriptSessionState): void {
  for (const record of state.records) {
    record.mounted = true
  }

  state.mountedRange =
    state.records.length === 0
      ? null
      : { start: 0, end: state.records.length - 1 }
}
