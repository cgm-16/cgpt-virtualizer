import { createReportContentAvailabilityMessage } from "../shared/messages.ts";
import type { MutationObserverLike } from "./append.ts";
import type { ResolvedContentSelectors } from "./selectors.ts";

const ATTRIBUTE_SELECTOR_PATTERN = /\[\s*([^\s~|^$*=\]]+)/g;
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
