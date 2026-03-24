import { createReportContentAvailabilityMessage } from "../shared/messages.ts";
import type { MutationObserverLike } from "./append.ts";
import type { ResolvedContentSelectors } from "./selectors.ts";

// 단순 속성 선택자만 처리한다 (예: [attr], [attr=val], [attr^=val]).
// 따옴표 안에 ']'가 포함된 값은 지원하지 않는다.
const ATTRIBUTE_SELECTOR_PATTERN = /\[\s*([^\s~|^$*=\]]+)/g;
// 속성 세그먼트를 제거한 뒤 '.', '#' 존재 여부로 class/id 의존성을 판별한다.
// 따옴표 안에 ']'가 포함된 속성 값은 지원하지 않는다.
const ATTRIBUTE_SEGMENT_PATTERN = /\[[^\]]*\]/g;

type ReportAvailability = (
  message: ReturnType<typeof createReportContentAvailabilityMessage>,
) => void;

export interface SelectorFailureObserverManager {
  disconnect(): void;
  sync(): void;
}

export interface SelectorFailureObserverManagerDependencies {
  attributeFilter?: string[];
  createMutationObserver(callback: MutationCallback): MutationObserverLike;
  document: Document;
  handleSelectorFailure(): void;
  resolveSelectors(document: Document): ResolvedContentSelectors | null;
}

export function collectObservedSelectorAttributes(
  selectors: readonly string[],
): string[] {
  const attributes: string[] = [];

  for (const selector of selectors) {
    for (const match of selector.matchAll(ATTRIBUTE_SELECTOR_PATTERN)) {
      pushUniqueAttribute(attributes, match[1]);
    }

    const selectorWithoutAttributeSegments = selector.replace(
      ATTRIBUTE_SEGMENT_PATTERN,
      "",
    );

    if (selectorWithoutAttributeSegments.includes(".")) {
      pushUniqueAttribute(attributes, "class");
    }

    if (selectorWithoutAttributeSegments.includes("#")) {
      pushUniqueAttribute(attributes, "id");
    }
  }

  return attributes;
}

export function createSelectorFailureObserverManager(
  dependencies: SelectorFailureObserverManagerDependencies,
): SelectorFailureObserverManager {
  const observationRoot =
    dependencies.document.body ?? dependencies.document.documentElement ?? null;
  const sync = () => {
    if (dependencies.resolveSelectors(dependencies.document) !== null) {
      return;
    }

    dependencies.handleSelectorFailure();
  };

  if (!(observationRoot instanceof Node)) {
    return {
      disconnect() {},
      sync,
    };
  }

  const observer = dependencies.createMutationObserver(() => {
    sync();
  });

  const observeOptions: MutationObserverInit = {
    childList: true,
    subtree: true,
  };

  if ((dependencies.attributeFilter?.length ?? 0) > 0) {
    observeOptions.attributeFilter = dependencies.attributeFilter;
    observeOptions.attributes = true;
  }

  observer.observe(observationRoot, observeOptions);

  return {
    disconnect() {
      observer.disconnect();
    },
    sync,
  };
}

export function handleSelectorStartupFailure(
  reportAvailability: ReportAvailability,
): "unavailable" {
  reportUnavailableStatus(reportAvailability);

  return "unavailable";
}

export function reportUnavailableStatus(
  reportAvailability: ReportAvailability,
): void {
  reportAvailability(createReportContentAvailabilityMessage("unavailable"));
}

function pushUniqueAttribute(attributes: string[], attribute: string): void {
  if (attributes.includes(attribute)) {
    return;
  }

  attributes.push(attribute);
}
