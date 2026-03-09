import type { MutationObserverLike } from "./append.ts";

export interface StreamingObserverManager {
  disconnect(): void;
  sync(): void;
}

export interface StreamingObserverManagerDependencies {
  createMutationObserver(callback: MutationCallback): MutationObserverLike;
  document: Document;
  onStreamingChange(nextIsStreaming: boolean): void;
  streamingIndicatorSelector: string;
}

export function detectStreamingState(
  document: Document,
  streamingIndicatorSelector: string,
): boolean {
  const indicator = document.querySelector(streamingIndicatorSelector);

  if (indicator === null) {
    return false;
  }

  if (
    indicator.hasAttribute("hidden") ||
    indicator.getAttribute("aria-hidden") === "true"
  ) {
    return false;
  }

  if (indicator instanceof HTMLElement) {
    if (indicator.hidden) {
      return false;
    }

    const ownerWindow = indicator.ownerDocument.defaultView;

    if (
      ownerWindow !== null &&
      ownerWindow.getComputedStyle(indicator).display === "none"
    ) {
      return false;
    }
  }

  return true;
}

export function createStreamingObserverManager(
  dependencies: StreamingObserverManagerDependencies,
): StreamingObserverManager {
  let isStreaming = detectStreamingState(
    dependencies.document,
    dependencies.streamingIndicatorSelector,
  );
  const observer = dependencies.createMutationObserver(() => {
    sync();
  });
  const observationRoot =
    dependencies.document.body ?? dependencies.document.documentElement ?? null;

  if (observationRoot !== null) {
    observer.observe(observationRoot, {
      attributeFilter: ["aria-hidden", "class", "hidden", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  function sync(): void {
    const nextIsStreaming = detectStreamingState(
      dependencies.document,
      dependencies.streamingIndicatorSelector,
    );

    if (nextIsStreaming === isStreaming) {
      return;
    }

    isStreaming = nextIsStreaming;
    dependencies.onStreamingChange(nextIsStreaming);
  }

  return {
    disconnect() {
      observer.disconnect();
    },
    sync,
  };
}
