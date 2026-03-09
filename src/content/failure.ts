import { createReportContentAvailabilityMessage } from "../shared/messages.ts";
import type { MutationObserverLike } from "./append.ts";
import type { ResolvedContentSelectors } from "./selectors.ts";

type ReportAvailability = (
  message: ReturnType<typeof createReportContentAvailabilityMessage>,
) => void;

export interface SelectorFailureObserverManager {
  disconnect(): void;
  sync(): void;
}

export interface SelectorFailureObserverManagerDependencies {
  createMutationObserver(callback: MutationCallback): MutationObserverLike;
  document: Document;
  handleSelectorFailure(): void;
  resolveSelectors(document: Document): ResolvedContentSelectors | null;
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

  observer.observe(observationRoot, {
    childList: true,
    subtree: true,
  });

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
