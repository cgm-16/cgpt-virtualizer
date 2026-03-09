import { estimateDetachedCachePressure } from "./memory-guard.ts";
import type { TranscriptSessionState } from "./state.ts";

const TOP_SPACER_SELECTOR = "[data-cgpt-top-spacer]";
const BOTTOM_SPACER_SELECTOR = "[data-cgpt-bottom-spacer]";

export const DEBUG_SESSION_STORAGE_KEY = "cgpt-virtualizer:debug";

export interface VirtualizationMetrics {
  bottomSpacerHeight: number;
  detachedNodeCount: number;
  directChildCount: number;
  estimatedDetachedHeight: number;
  isStreaming: boolean;
  mountedBubbleCount: number;
  mountedRange: { end: number; start: number } | null;
  mountedWindowHeight: number;
  scrollTop: number;
  topSpacerHeight: number;
  totalBubbleCount: number;
  totalHeight: number;
  viewportHeight: number;
}

type DebugSink = (...args: unknown[]) => void;

export function createDebugLogger(
  enabled: boolean,
  sink: DebugSink = console.debug.bind(console) as DebugSink,
): (event: string, payload?: unknown) => void {
  return (event, payload) => {
    if (!enabled) {
      return;
    }

    sink("[cgpt-virtualizer]", event, payload);
  };
}

export function isDebugModeEnabled(
  storage: Pick<Storage, "getItem"> | null = resolveDebugStorage(),
): boolean {
  try {
    return storage?.getItem(DEBUG_SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function recordVirtualizationMetrics(
  state: TranscriptSessionState,
): VirtualizationMetrics {
  const pressure = estimateDetachedCachePressure(state);
  const totalHeight =
    state.records.length === 0
      ? 0
      : (state.prefixSums[state.prefixSums.length - 1] ?? 0);

  return {
    bottomSpacerHeight: resolveSpacerHeight(
      state.transcriptRoot,
      BOTTOM_SPACER_SELECTOR,
    ),
    detachedNodeCount: pressure.detachedNodeCount,
    directChildCount: state.transcriptRoot.children.length,
    estimatedDetachedHeight: pressure.estimatedDetachedHeight,
    isStreaming: state.isStreaming,
    mountedBubbleCount:
      state.mountedRange === null
        ? 0
        : state.mountedRange.end - state.mountedRange.start + 1,
    mountedRange: state.mountedRange,
    mountedWindowHeight: resolveMountedWindowHeight(state),
    scrollTop: state.scrollContainer.scrollTop,
    topSpacerHeight: resolveSpacerHeight(
      state.transcriptRoot,
      TOP_SPACER_SELECTOR,
    ),
    totalBubbleCount: state.records.length,
    totalHeight,
    viewportHeight: resolveViewportHeight(state.scrollContainer),
  };
}

export function reportVirtualizationMetrics(
  event: string,
  state: TranscriptSessionState,
  dependencies: {
    sink?: DebugSink;
    storage?: Pick<Storage, "getItem"> | null;
  } = {},
): VirtualizationMetrics | null {
  const storage =
    dependencies.storage === undefined
      ? resolveDebugStorage()
      : dependencies.storage;

  if (!isDebugModeEnabled(storage)) {
    return null;
  }

  const metrics = recordVirtualizationMetrics(state);
  createDebugLogger(true, dependencies.sink)(event, metrics);

  return metrics;
}

export function assertMountedWindowBounds(
  state: TranscriptSessionState,
  start: number,
  end: number,
): void {
  const expectedMountedCount = end - start + 1;
  const directChildren = Array.from(state.transcriptRoot.children);
  const directBubbleChildren = directChildren.filter(
    (child) => !isSpacer(child),
  );

  if (directBubbleChildren.length !== expectedMountedCount) {
    throw new Error("Mounted window bubble 수가 기대 범위를 벗어났습니다.");
  }

  if (directChildren.length !== expectedMountedCount + 2) {
    throw new Error(
      "Mounted window direct child 수가 spacer를 포함한 기대치와 다릅니다.",
    );
  }

  for (const record of state.records) {
    const shouldBeMounted = record.index >= start && record.index <= end;
    const isDirectChild = record.node.parentElement === state.transcriptRoot;

    if (record.mounted !== shouldBeMounted) {
      throw new Error("Mounted flag가 현재 DOM window와 일치하지 않습니다.");
    }

    if (isDirectChild !== shouldBeMounted) {
      throw new Error(
        "DOM에 연결된 bubble이 mounted window와 일치하지 않습니다.",
      );
    }
  }
}

function isSpacer(element: Element): boolean {
  return (
    element.matches(TOP_SPACER_SELECTOR) ||
    element.matches(BOTTOM_SPACER_SELECTOR)
  );
}

function resolveMountedWindowHeight(state: TranscriptSessionState): number {
  if (state.mountedRange === null) {
    return 0;
  }

  const end = state.prefixSums[state.mountedRange.end] ?? 0;
  const start =
    state.mountedRange.start === 0
      ? 0
      : (state.prefixSums[state.mountedRange.start - 1] ?? 0);

  return end - start;
}

function resolveSpacerHeight(root: HTMLElement, selector: string): number {
  const spacer = root.querySelector<HTMLElement>(`:scope > ${selector}`);

  if (spacer === null) {
    return 0;
  }

  const parsedHeight = Number.parseFloat(spacer.style.height);

  return Number.isNaN(parsedHeight) ? 0 : parsedHeight;
}

function resolveViewportHeight(scrollContainer: HTMLElement): number {
  return (
    scrollContainer.clientHeight ||
    scrollContainer.getBoundingClientRect().height
  );
}

function resolveDebugStorage(): Pick<Storage, "getItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
