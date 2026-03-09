export interface ContentSelectorRegistry {
  bubble: string;
  scrollContainer: string;
  streamingIndicator: string;
  transcriptRoot: string;
}

export interface ResolvedContentSelectors {
  bubbleSelector: string;
  scrollContainer: HTMLElement;
  streamingIndicatorSelector: string;
  transcriptRoot: HTMLElement;
}

export const CONTENT_SELECTOR_REGISTRY: ContentSelectorRegistry = {
  // 실제 ChatGPT 선택자가 확인되면 이 자리의 정확한 선택자로 교체한다.
  bubble: "[data-cgpt-transcript-bubble]",
  scrollContainer: "[data-cgpt-scroll-container]",
  streamingIndicator: "[data-cgpt-streaming-indicator]",
  transcriptRoot: "[data-cgpt-transcript-root]",
};

export function resolveSelectors(
  document: Document,
  registry: ContentSelectorRegistry = CONTENT_SELECTOR_REGISTRY,
): ResolvedContentSelectors | null {
  const scrollContainer = document.querySelector<HTMLElement>(
    registry.scrollContainer,
  );
  const transcriptRoot = document.querySelector<HTMLElement>(
    registry.transcriptRoot,
  );

  if (scrollContainer === null || transcriptRoot === null) {
    return null;
  }

  return {
    bubbleSelector: registry.bubble,
    scrollContainer,
    streamingIndicatorSelector: registry.streamingIndicator,
    transcriptRoot,
  };
}
