import { createReportContentAvailabilityMessage } from "../shared/messages.ts";
import type { ContentAvailability } from "../shared/types.ts";
import { isSupportedTranscriptPath } from "../shared/routes.ts";
import {
  createAppendObserverManager,
  type MutationObserverLike,
} from "./append.ts";
import { resolveAvailability } from "./availability.ts";
import { measureBubble } from "./measure.ts";
import { clearStreamingPlaceholder } from "./placeholder.ts";
import { buildPrefixSums } from "./prefix-sums.ts";
import {
  createStructuralRebuildObserverManager,
  destroyTranscriptSession,
  requestDirtyRebuild,
  runDirtyRebuild,
} from "./rebuild.ts";
import {
  collectObservedSelectorAttributes,
  createSelectorFailureObserverManager,
  reportUnavailableStatus,
} from "./failure.ts";
import { reportVirtualizationMetrics } from "./debug.ts";
import {
  DEFAULT_MEMORY_GUARD_THRESHOLD,
  estimateDetachedCachePressure,
  shouldDisableVirtualizationForMemory,
  type MemoryGuardThreshold,
} from "./memory-guard.ts";
import {
  createResizeObserverManager,
  type ResizeObserverLike,
} from "./resize.ts";
import { disableCurrentTabVirtualization } from "./runtime-control.ts";
import {
  applyPendingAnchorCorrection,
  initializeScrollVirtualization,
} from "./scroll.ts";
import {
  CONTENT_SELECTOR_REGISTRY,
  normalizeCandidates,
  resolveSelectors,
} from "./selectors.ts";
import {
  buildBubbleRecords,
  markAllRecordsMounted,
  type TranscriptSessionState,
} from "./state.ts";
import {
  createStreamingObserverManager,
  detectStreamingState,
} from "./streaming.ts";
import {
  scanTranscript,
  type TranscriptScanResult,
} from "./transcript-scan.ts";

const SELECTOR_FAILURE_ATTRIBUTE_FILTER = collectObservedSelectorAttributes([
  ...normalizeCandidates(CONTENT_SELECTOR_REGISTRY.scrollContainer),
  ...normalizeCandidates(CONTENT_SELECTOR_REGISTRY.transcriptRoot),
]);
const STARTUP_DISCOVERY_ATTRIBUTE_FILTER = collectObservedSelectorAttributes([
  ...normalizeCandidates(CONTENT_SELECTOR_REGISTRY.bubble),
  ...normalizeCandidates(CONTENT_SELECTOR_REGISTRY.scrollContainer),
  ...normalizeCandidates(CONTENT_SELECTOR_REGISTRY.transcriptRoot),
]);

const STARTUP_DISCOVERY_TIMEOUT_MS = 10_000;
type StartupDiscoveryAvailability = Extract<
  ContentAvailability,
  "inactive" | "unavailable"
>;

export interface ContentBootstrapDependencies {
  clearTimeout?(handle: number): void;
  createMutationObserver?(callback: MutationCallback): MutationObserverLike;
  createResizeObserver?(callback: ResizeObserverCallback): ResizeObserverLike;
  disableVirtualizationForMemoryGuard?(): Promise<void> | void;
  document: Document;
  memoryGuardThreshold?: MemoryGuardThreshold;
  pathname: string;
  reportAvailability(
    message: ReturnType<typeof createReportContentAvailabilityMessage>,
  ): void;
  requestAnimationFrame?(callback: FrameRequestCallback): number;
  setTimeout?(callback: () => void, delay: number): number;
}

export interface ContentBootstrapResult {
  availability: ContentAvailability;
  destroy(): void;
  scanResult: TranscriptScanResult | null;
  sessionState: TranscriptSessionState | null;
}

export function bootstrapContentScript(
  dependencies: ContentBootstrapDependencies = createDefaultDependencies(),
): ContentBootstrapResult {
  const selectors = isSupportedTranscriptPath(dependencies.pathname)
    ? resolveSelectors(dependencies.document)
    : null;
  const baseAvailability = resolveAvailability(
    dependencies.pathname,
    selectors,
  );

  if (baseAvailability === "idle") {
    dependencies.reportAvailability(
      createReportContentAvailabilityMessage("idle"),
    );

    return {
      availability: "idle",
      destroy() {},
      scanResult: null,
      sessionState: null,
    };
  }

  // baseAvailability is "unavailable" or "available" from here on.
  // In both cases we may enter the startup discovery phase if selectors are
  // missing or the transcript has too few bubbles to activate.

  const scanResult = selectors !== null ? scanTranscript(selectors) : null;
  const availability: ContentAvailability =
    baseAvailability === "available" &&
    scanResult !== null &&
    !scanResult.activationEligible
      ? "inactive"
      : baseAvailability;

  // Shared mutable state for the session (populated by establishSession).
  let sessionState: TranscriptSessionState | null = null;
  let destroyCurrent: () => void = () => {};

  // startDiscovery returns a destroy function that cleans up the observer and
  // timeout. It reports "unavailable" / "inactive" as the startup DOM evolves
  // and calls onSessionReady when the DOM becomes eligible.
  function startDiscovery(
    onAvailabilityChange: (availability: StartupDiscoveryAvailability) => void,
    onSessionReady: (
      resolvedSelectors: ReturnType<typeof resolveSelectors> & object,
      resolvedScanResult: TranscriptScanResult,
    ) => void,
  ): () => void {
    const createMutationObserver =
      dependencies.createMutationObserver ??
      ((callback: MutationCallback) => new MutationObserver(callback));
    const setTimeoutFn =
      dependencies.setTimeout ?? window.setTimeout.bind(window);
    const clearTimeoutFn =
      dependencies.clearTimeout ?? window.clearTimeout.bind(window);

    let done = false;
    let reportedAvailability: StartupDiscoveryAvailability | null = null;

    const cleanup = () => {
      if (done) {
        return;
      }

      done = true;
      observer.disconnect();
      clearTimeoutFn(timeoutHandle);
    };

    const reportDiscoveryAvailability = (
      nextAvailability: StartupDiscoveryAvailability,
    ) => {
      if (reportedAvailability === nextAvailability) {
        return;
      }

      reportedAvailability = nextAvailability;
      onAvailabilityChange(nextAvailability);
    };

    const tryResolve = () => {
      if (done) {
        return;
      }

      const nextSelectors = resolveSelectors(dependencies.document);

      if (nextSelectors === null) {
        reportDiscoveryAvailability("unavailable");
        return;
      }

      const nextScanResult = scanTranscript(nextSelectors);

      if (!nextScanResult.activationEligible) {
        reportDiscoveryAvailability("inactive");
        return;
      }

      cleanup();
      onSessionReady(nextSelectors, nextScanResult);
    };

    const observationRoot =
      dependencies.document.body ??
      dependencies.document.documentElement ??
      null;

    const observer = createMutationObserver(() => {
      tryResolve();
    });

    if (observationRoot instanceof Node) {
      observer.observe(observationRoot, {
        attributeFilter: STARTUP_DISCOVERY_ATTRIBUTE_FILTER,
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
    // If observationRoot is null (both body and documentElement are absent),
    // the observer is never attached and discovery relies solely on the timeout
    // to report failure.

    const timeoutHandle = setTimeoutFn(() => {
      if (done) {
        return;
      }

      cleanup();
    }, STARTUP_DISCOVERY_TIMEOUT_MS);

    tryResolve();

    return cleanup;
  }

  // Establishes the live virtualizer session given resolved selectors and scan
  // result. Returns the new session state; also mutates the outer `destroyCurrent`
  // binding as a side-effect so callers can later tear down the session.
  function establishSession(
    activeSelectors: NonNullable<ReturnType<typeof resolveSelectors>>,
    activeScanResult: TranscriptScanResult,
  ): TranscriptSessionState {
    const activeSessionState = createTranscriptSessionState(
      activeSelectors.scrollContainer,
      activeScanResult,
    );

    let appendObserverManager: ReturnType<
      typeof createAppendObserverManager
    > | null = null;
    let resizeObserverManager: ReturnType<
      typeof createResizeObserverManager
    > | null = null;
    let selectorFailureObserverManager: ReturnType<
      typeof createSelectorFailureObserverManager
    > | null = null;
    let structuralRebuildObserverManager: ReturnType<
      typeof createStructuralRebuildObserverManager
    > | null = null;
    let streamingObserverManager: ReturnType<
      typeof createStreamingObserverManager
    > | null = null;
    let dirtyRebuildInProgress = false;
    let sessionClosed = false;
    let scrollController: ReturnType<
      typeof initializeScrollVirtualization
    > | null = null;
    const memoryGuardThreshold =
      dependencies.memoryGuardThreshold ?? DEFAULT_MEMORY_GUARD_THRESHOLD;

    activeSessionState.isStreaming = detectStreamingState(
      dependencies.document,
      activeSelectors.streamingIndicatorSelector,
    );

    if (activeSessionState.isStreaming) {
      markAllRecordsMounted(activeSessionState);
    }

    const disconnectObservers = () => {
      appendObserverManager?.disconnect();
      appendObserverManager = null;
      resizeObserverManager?.disconnect();
      resizeObserverManager = null;
      selectorFailureObserverManager?.disconnect();
      selectorFailureObserverManager = null;
      structuralRebuildObserverManager?.disconnect();
      structuralRebuildObserverManager = null;
      streamingObserverManager?.disconnect();
      streamingObserverManager = null;
    };

    const teardownSession = () => {
      if (sessionClosed) {
        return false;
      }

      sessionClosed = true;
      disconnectObservers();
      scrollController?.disconnect();
      scrollController = null;
      destroyTranscriptSession(activeSessionState);

      return true;
    };

    const handleMidSessionSelectorFailure = () => {
      reportVirtualizationMetrics("selector-failure", activeSessionState);

      if (!teardownSession()) {
        return false;
      }

      reportUnavailableStatus(dependencies.reportAvailability);

      return true;
    };

    scrollController = initializeScrollVirtualization(activeSessionState, {
      afterPatch() {
        appendObserverManager?.flushPendingMutationRecords();
        structuralRebuildObserverManager?.flushPendingMutationRecords();
        resizeObserverManager?.refreshObservedRecords();
        reportVirtualizationMetrics("patch-applied", activeSessionState);
        maybeHandleMemoryGuard();
      },
      requestAnimationFrame:
        dependencies.requestAnimationFrame ??
        window.requestAnimationFrame.bind(window),
    });

    function maybeHandleMemoryGuard(): boolean {
      const pressure = estimateDetachedCachePressure(activeSessionState);

      if (
        !shouldDisableVirtualizationForMemory(pressure, memoryGuardThreshold)
      ) {
        return false;
      }

      reportVirtualizationMetrics("memory-guard-trip", activeSessionState);

      if (!teardownSession()) {
        return false;
      }

      void (
        dependencies.disableVirtualizationForMemoryGuard ??
        disableCurrentTabVirtualization
      )();

      return true;
    }

    destroyCurrent = () => {
      teardownSession();
    };

    const runPendingDirtyRebuild = () => {
      if (
        activeSessionState.dirtyRebuildReason === null ||
        dirtyRebuildInProgress
      ) {
        return false;
      }

      dirtyRebuildInProgress = true;

      try {
        return runDirtyRebuild(
          activeSessionState,
          activeSessionState.dirtyRebuildReason,
          {
            detectStreamingState,
            disconnectObservers,
            document: dependencies.document,
            handleSelectorFailure() {
              handleMidSessionSelectorFailure();
            },
            measure: measureBubble,
            reconnectObservers: connectObservers,
            resolveSelectors,
            schedulePatch(options) {
              return scrollController?.schedulePatch(options) ?? false;
            },
          },
        );
      } finally {
        dirtyRebuildInProgress = false;
      }
    };

    const requestDirtyRebuildAndMaybeRun = (
      state: TranscriptSessionState,
      reason: Parameters<typeof requestDirtyRebuild>[1],
    ) => {
      requestDirtyRebuild(state, reason);

      if (state.isStreaming) {
        return;
      }

      runPendingDirtyRebuild();
    };

    function connectObservers(): void {
      resizeObserverManager = createResizeObserverManager(activeSessionState, {
        applyPendingCorrection() {
          applyPendingAnchorCorrection(activeSessionState);
        },
        createResizeObserver:
          dependencies.createResizeObserver ??
          ((callback) => new ResizeObserver(callback)),
        measure: measureBubble,
        schedulePatch() {
          return scrollController?.schedulePatch() ?? false;
        },
      });
      appendObserverManager = createAppendObserverManager(activeSessionState, {
        clearTimeout:
          dependencies.clearTimeout ?? window.clearTimeout.bind(window),
        createMutationObserver:
          dependencies.createMutationObserver ??
          ((callback) => new MutationObserver(callback)),
        isTranscriptBubble(node): node is Element {
          return (
            node instanceof Element &&
            node.matches(activeSelectors.bubbleSelector)
          );
        },
        measure: measureBubble,
        requestDirtyRebuild: requestDirtyRebuildAndMaybeRun,
        schedulePatch(options) {
          return scrollController?.schedulePatch(options) ?? false;
        },
        setTimeout: dependencies.setTimeout ?? window.setTimeout.bind(window),
      });
      structuralRebuildObserverManager = createStructuralRebuildObserverManager(
        activeSessionState,
        {
          createMutationObserver:
            dependencies.createMutationObserver ??
            ((callback) => new MutationObserver(callback)),
          requestDirtyRebuild: requestDirtyRebuildAndMaybeRun,
        },
      );
      selectorFailureObserverManager = createSelectorFailureObserverManager({
        attributeFilter: SELECTOR_FAILURE_ATTRIBUTE_FILTER,
        createMutationObserver:
          dependencies.createMutationObserver ??
          ((callback) => new MutationObserver(callback)),
        document: dependencies.document,
        handleSelectorFailure() {
          handleMidSessionSelectorFailure();
        },
        resolveSelectors,
      });
      streamingObserverManager = createStreamingObserverManager({
        createMutationObserver:
          dependencies.createMutationObserver ??
          ((callback) => new MutationObserver(callback)),
        document: dependencies.document,
        onStreamingChange(nextIsStreaming) {
          activeSessionState.isStreaming = nextIsStreaming;

          if (nextIsStreaming) {
            return;
          }

          clearStreamingPlaceholder(activeSessionState);

          if (activeSessionState.dirtyRebuildReason !== null) {
            runPendingDirtyRebuild();
            return;
          }

          appendObserverManager?.flushPendingAppends();
          scrollController?.schedulePatch({ force: true });
        },
        streamingIndicatorSelector: activeSelectors.streamingIndicatorSelector,
      });
      resizeObserverManager.refreshObservedRecords();
      selectorFailureObserverManager.sync();
      streamingObserverManager.sync();
    }

    if (!sessionClosed) {
      connectObservers();
    }

    return activeSessionState;
  }

  if (
    availability === "available" &&
    selectors !== null &&
    scanResult !== null
  ) {
    // DOM is ready and has enough bubbles — establish session immediately.
    sessionState = establishSession(selectors, scanResult);
    dependencies.reportAvailability(
      createReportContentAvailabilityMessage("available"),
    );
  } else {
    // Selectors are missing or the transcript is still below the activation
    // threshold — keep discovery running until it becomes active.
    const stopDiscovery = startDiscovery(
      (nextAvailability) => {
        dependencies.reportAvailability(
          createReportContentAvailabilityMessage(nextAvailability),
        );
      },
      (resolvedSelectors, resolvedScanResult) => {
        sessionState = establishSession(resolvedSelectors, resolvedScanResult);
        dependencies.reportAvailability(
          createReportContentAvailabilityMessage("available"),
        );
      },
    );

    destroyCurrent = stopDiscovery;
  }

  return {
    availability,
    destroy() {
      destroyCurrent();
    },
    scanResult,
    sessionState,
  };
}

function createDefaultDependencies(): ContentBootstrapDependencies {
  return {
    document,
    pathname: window.location.pathname,
    reportAvailability(message) {
      chrome.runtime.sendMessage(message);
    },
    requestAnimationFrame(callback) {
      return window.requestAnimationFrame(callback);
    },
  };
}

function createTranscriptSessionState(
  scrollContainer: HTMLElement,
  scanResult: TranscriptScanResult,
): TranscriptSessionState {
  const records = buildBubbleRecords(scanResult.bubbles, measureBubble);

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
  };
}
