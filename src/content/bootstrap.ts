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
import {
  createStructuralRebuildObserverManager,
  destroyTranscriptSession,
  requestDirtyRebuild,
  runDirtyRebuild,
} from './rebuild.ts'
import {
  createSelectorFailureObserverManager,
  handleSelectorStartupFailure,
  reportUnavailableStatus,
} from './failure.ts'
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
  markAllRecordsMounted,
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
  destroy(): void
  scanResult: TranscriptScanResult | null
  sessionState: TranscriptSessionState | null
}

export function bootstrapContentScript(
  dependencies: ContentBootstrapDependencies = createDefaultDependencies(),
): ContentBootstrapResult {
  const selectors = isSupportedTranscriptPath(dependencies.pathname)
    ? resolveSelectors(dependencies.document)
    : null
  const baseAvailability = resolveAvailability(dependencies.pathname, selectors)

  if (baseAvailability === 'unavailable') {
    return {
      availability: handleSelectorStartupFailure(dependencies.reportAvailability),
      destroy() {},
      scanResult: null,
      sessionState: null,
    }
  }

  const scanResult = selectors !== null ? scanTranscript(selectors) : null
  const availability =
    baseAvailability === 'available' && scanResult !== null && !scanResult.activationEligible
      ? 'inactive'
      : baseAvailability
  const sessionState =
    availability === 'available' && selectors !== null && scanResult !== null
      ? createTranscriptSessionState(selectors.scrollContainer, scanResult)
      : null
  let destroy = () => {}

  if (sessionState !== null && selectors !== null) {
    const activeSelectors = selectors
    const activeSessionState = sessionState
    let appendObserverManager: ReturnType<typeof createAppendObserverManager> | null = null
    let resizeObserverManager: ReturnType<typeof createResizeObserverManager> | null = null
    let selectorFailureObserverManager:
      | ReturnType<typeof createSelectorFailureObserverManager>
      | null = null
    let structuralRebuildObserverManager:
      | ReturnType<typeof createStructuralRebuildObserverManager>
      | null = null
    let streamingObserverManager: ReturnType<typeof createStreamingObserverManager> | null = null
    let dirtyRebuildInProgress = false
    let sessionClosed = false

    activeSessionState.isStreaming = detectStreamingState(
      dependencies.document,
      activeSelectors.streamingIndicatorSelector,
    )

    if (activeSessionState.isStreaming) {
      markAllRecordsMounted(activeSessionState)
    }

    const scrollController = initializeScrollVirtualization(activeSessionState, {
      afterPatch() {
        appendObserverManager?.flushPendingMutationRecords()
        structuralRebuildObserverManager?.flushPendingMutationRecords()
        resizeObserverManager?.refreshObservedRecords()
      },
      requestAnimationFrame: dependencies.requestAnimationFrame ?? window.requestAnimationFrame.bind(window),
    })

    const disconnectObservers = () => {
      appendObserverManager?.disconnect()
      appendObserverManager = null
      resizeObserverManager?.disconnect()
      resizeObserverManager = null
      selectorFailureObserverManager?.disconnect()
      selectorFailureObserverManager = null
      structuralRebuildObserverManager?.disconnect()
      structuralRebuildObserverManager = null
      streamingObserverManager?.disconnect()
      streamingObserverManager = null
    }

    const teardownSession = () => {
      if (sessionClosed) {
        return false
      }

      sessionClosed = true
      disconnectObservers()
      scrollController.disconnect()
      destroyTranscriptSession(activeSessionState)

      return true
    }

    const handleMidSessionSelectorFailure = () => {
      if (!teardownSession()) {
        return false
      }

      reportUnavailableStatus(dependencies.reportAvailability)

      return true
    }

    destroy = () => {
      teardownSession()
    }

    const runPendingDirtyRebuild = () => {
      if (activeSessionState.dirtyRebuildReason === null || dirtyRebuildInProgress) {
        return false
      }

      dirtyRebuildInProgress = true

      try {
        return runDirtyRebuild(activeSessionState, activeSessionState.dirtyRebuildReason, {
          detectStreamingState,
          disconnectObservers,
          document: dependencies.document,
          handleSelectorFailure() {
            handleMidSessionSelectorFailure()
          },
          measure: measureBubble,
          reconnectObservers: connectObservers,
          resolveSelectors,
          schedulePatch(options) {
            return scrollController.schedulePatch(options)
          },
        })
      } finally {
        dirtyRebuildInProgress = false
      }
    }

    const requestDirtyRebuildAndMaybeRun = (
      state: TranscriptSessionState,
      reason: Parameters<typeof requestDirtyRebuild>[1],
    ) => {
      requestDirtyRebuild(state, reason)

      if (state.isStreaming) {
        return
      }

      runPendingDirtyRebuild()
    }

    function connectObservers(): void {
      resizeObserverManager = createResizeObserverManager(activeSessionState, {
        applyPendingCorrection() {
          applyPendingAnchorCorrection(activeSessionState)
        },
        createResizeObserver:
          dependencies.createResizeObserver ?? ((callback) => new ResizeObserver(callback)),
        measure: measureBubble,
        schedulePatch() {
          return scrollController.schedulePatch()
        },
      })
      appendObserverManager = createAppendObserverManager(activeSessionState, {
        clearTimeout: dependencies.clearTimeout ?? window.clearTimeout.bind(window),
        createMutationObserver:
          dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
        isTranscriptBubble(node): node is Element {
          return node instanceof Element && node.matches(activeSelectors.bubbleSelector)
        },
        measure: measureBubble,
        requestDirtyRebuild: requestDirtyRebuildAndMaybeRun,
        schedulePatch(options) {
          return scrollController.schedulePatch(options)
        },
        setTimeout: dependencies.setTimeout ?? window.setTimeout.bind(window),
      })
      structuralRebuildObserverManager = createStructuralRebuildObserverManager(activeSessionState, {
        createMutationObserver:
          dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
        requestDirtyRebuild: requestDirtyRebuildAndMaybeRun,
      })
      selectorFailureObserverManager = createSelectorFailureObserverManager({
        createMutationObserver:
          dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
        document: dependencies.document,
        handleSelectorFailure() {
          handleMidSessionSelectorFailure()
        },
        resolveSelectors,
      })
      streamingObserverManager = createStreamingObserverManager({
        createMutationObserver:
          dependencies.createMutationObserver ?? ((callback) => new MutationObserver(callback)),
        document: dependencies.document,
        onStreamingChange(nextIsStreaming) {
          activeSessionState.isStreaming = nextIsStreaming

          if (nextIsStreaming) {
            return
          }

          clearStreamingPlaceholder(activeSessionState)

          if (activeSessionState.dirtyRebuildReason !== null) {
            runPendingDirtyRebuild()
            return
          }

          appendObserverManager?.flushPendingAppends()
          scrollController.schedulePatch({ force: true })
        },
        streamingIndicatorSelector: activeSelectors.streamingIndicatorSelector,
      })
      resizeObserverManager.refreshObservedRecords()
      selectorFailureObserverManager.sync()
      streamingObserverManager.sync()
    }

    connectObservers()
  }

  dependencies.reportAvailability(createReportContentAvailabilityMessage(availability))

  return { availability, destroy, scanResult, sessionState }
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
