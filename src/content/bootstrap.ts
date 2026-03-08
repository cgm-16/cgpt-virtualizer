import { createReportContentAvailabilityMessage } from '../shared/messages.ts'
import type { ContentAvailability } from '../shared/types.ts'
import { isSupportedTranscriptPath } from '../shared/routes.ts'
import { resolveAvailability } from './availability.ts'
import { measureBubble } from './measure.ts'
import { buildPrefixSums } from './prefix-sums.ts'
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
import { scanTranscript, type TranscriptScanResult } from './transcript-scan.ts'

export interface ContentBootstrapDependencies {
  createResizeObserver?(callback: ResizeObserverCallback): ResizeObserverLike
  document: Document
  pathname: string
  reportAvailability(message: ReturnType<typeof createReportContentAvailabilityMessage>): void
  requestAnimationFrame?(callback: FrameRequestCallback): number
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

  if (sessionState !== null) {
    let resizeObserverManager: ReturnType<typeof createResizeObserverManager> | null = null
    const scrollController = initializeScrollVirtualization(sessionState, {
      afterPatch() {
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
    resizeObserverManager.refreshObservedRecords()
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
    transcriptRoot: scanResult.transcriptRoot,
    pendingScrollCorrection: 0,
    scrollContainer,
    records,
    prefixSums: buildPrefixSums(records),
    mountedRange: null,
  }
}
