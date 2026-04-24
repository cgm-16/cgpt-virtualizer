// 각 역할마다 우선순위 순서로 시도할 후보 선택자를 하나 또는 여럿 지정할 수 있다.
export interface ContentSelectorRegistry {
  bubble: string | readonly string[];
  scrollContainer: string | readonly string[];
  streamingIndicator: string | readonly string[];
  transcriptRoot: string | readonly string[];
}

export interface ResolvedContentSelectors {
  bubbleSelector: string;
  scrollContainer: HTMLElement;
  streamingIndicatorSelector: string;
  transcriptRoot: HTMLElement;
}

// 이 레지스트리의 선택자는 테스트 픽스처 전용 플레이스홀더다.
// 실제 ChatGPT DOM 선택자는 인증된 세션에서 직접 확인한 뒤 배열의 첫 번째 항목으로
// 추가해야 한다. 픽스처 플레이스홀더는 폴백으로 유지한다.
// 예시: bubble: ["실제-선택자", "[data-cgpt-transcript-bubble]"]
export const CONTENT_SELECTOR_REGISTRY: ContentSelectorRegistry = {
  bubble: "[data-cgpt-transcript-bubble]",
  scrollContainer: "[data-cgpt-scroll-container]",
  streamingIndicator: "[data-cgpt-streaming-indicator]",
  transcriptRoot: "[data-cgpt-transcript-root]",
};

// string | readonly string[] 값을 readonly string[] 로 정규화한다.
export function normalizeCandidates(
  candidates: string | readonly string[],
): readonly string[] {
  return typeof candidates === "string" ? [candidates] : candidates;
}

// 후보 선택자 목록에서 DOM에 존재하는 첫 번째 요소를 반환한다.
function resolveElement(
  document: Document,
  candidates: string | readonly string[],
): HTMLElement | null {
  const list = normalizeCandidates(candidates);
  for (const sel of list) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el !== null) return el;
  }
  return null;
}

// 후보 선택자 목록을 쉼표로 결합하여 복합 CSS 선택자 문자열을 만든다.
function joinCandidates(candidates: string | readonly string[]): string {
  return normalizeCandidates(candidates).join(",");
}

export function resolveSelectors(
  document: Document,
  registry: ContentSelectorRegistry = CONTENT_SELECTOR_REGISTRY,
): ResolvedContentSelectors | null {
  const scrollContainer = resolveElement(document, registry.scrollContainer);
  const transcriptRoot = resolveElement(document, registry.transcriptRoot);

  if (scrollContainer === null || transcriptRoot === null) {
    return null;
  }

  return {
    bubbleSelector: joinCandidates(registry.bubble),
    scrollContainer,
    streamingIndicatorSelector: joinCandidates(registry.streamingIndicator),
    transcriptRoot,
  };
}
