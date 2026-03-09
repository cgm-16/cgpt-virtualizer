import { accumulateScrollCorrection } from "./anchor.ts";
import { rebuildPrefixSumsFromIndex } from "./prefix-sums.ts";
import type { TranscriptSessionState } from "./state.ts";

const MIN_SIGNIFICANT_HEIGHT_DELTA_PX = 1;

export interface ResizeObserverLike {
  disconnect(): void;
  observe(target: Element): void;
  unobserve(target: Element): void;
}

export interface ResizeObserverManager {
  disconnect(): void;
  refreshObservedRecords(): void;
}

export interface ResizeObserverManagerDependencies {
  applyPendingCorrection(): void;
  createResizeObserver(callback: ResizeObserverCallback): ResizeObserverLike;
  measure(node: Element): number;
  schedulePatch(options?: { force?: boolean }): boolean;
}

export function shouldIgnoreHeightDelta(
  previousHeight: number,
  nextHeight: number,
): boolean {
  return (
    Math.abs(nextHeight - previousHeight) < MIN_SIGNIFICANT_HEIGHT_DELTA_PX
  );
}

export function createResizeObserverManager(
  state: TranscriptSessionState,
  dependencies: ResizeObserverManagerDependencies,
): ResizeObserverManager {
  const observedNodes = new Set<Element>();
  const recordsByNode = new Map(
    state.records.map((record) => [record.node, record]),
  );
  const observer = dependencies.createResizeObserver((entries) => {
    handleResizeEntries(entries);
  });

  const refreshObservedRecords = () => {
    for (const record of state.records) {
      if (!recordsByNode.has(record.node)) {
        recordsByNode.set(record.node, record);
      }

      const isObserved = observedNodes.has(record.node);
      const shouldObserve = record.mounted && record.node.isConnected;

      if (shouldObserve && !isObserved) {
        observer.observe(record.node);
        observedNodes.add(record.node);
      } else if (!shouldObserve && isObserved) {
        observer.unobserve(record.node);
        observedNodes.delete(record.node);
      }
    }
  };

  function handleResizeEntries(entries: readonly ResizeObserverEntry[]): void {
    let hasAcceptedResize = false;

    for (const entry of entries) {
      const record = recordsByNode.get(entry.target);

      if (record === undefined || !record.mounted || !record.node.isConnected) {
        continue;
      }

      const nextHeight = dependencies.measure(record.node);

      if (shouldIgnoreHeightDelta(record.measuredHeight, nextHeight)) {
        continue;
      }

      const previousHeight = record.measuredHeight;
      const heightDelta = nextHeight - previousHeight;

      record.measuredHeight = nextHeight;
      state.prefixSums = rebuildPrefixSumsFromIndex(
        state.prefixSums,
        state.records,
        record.index,
      );
      state.pendingScrollCorrection = accumulateScrollCorrection(
        state.pendingScrollCorrection,
        state.anchor,
        record.index,
        heightDelta,
      );
      hasAcceptedResize = true;
    }

    if (!hasAcceptedResize) {
      return;
    }

    if (dependencies.schedulePatch()) {
      return;
    }

    dependencies.applyPendingCorrection();
    dependencies.schedulePatch({ force: true });
  }

  return {
    disconnect() {
      observedNodes.clear();
      observer.disconnect();
    },
    refreshObservedRecords,
  };
}
