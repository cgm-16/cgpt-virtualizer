// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppendObserverManager,
  validateTailAppendMutations,
} from "../../src/content/append.ts";
import { APPEND_QUIET_PERIOD_MS } from "../../src/shared/constants.ts";
import type {
  BubbleRecord,
  TranscriptSessionState,
} from "../../src/content/state.ts";

describe("validateTailAppendMutations", () => {
  it("accepts matched bubbles appended at the transcript tail", () => {
    const fixture = makeSessionFixture([100, 100]);
    const appendedBubbleA = createBubble("Bubble 2");
    const appendedBubbleB = createBubble("Bubble 3");

    fixture.transcriptRoot.append(appendedBubbleA, appendedBubbleB);

    const result = validateTailAppendMutations(
      fixture.sessionState.records,
      fixture.transcriptRoot,
      [
        makeChildListMutationRecord(fixture.transcriptRoot, [
          appendedBubbleA,
          appendedBubbleB,
        ]),
      ],
      isTranscriptBubble,
    );

    expect(result).toEqual({
      kind: "accepted",
      nodes: [appendedBubbleA, appendedBubbleB],
    });
  });

  it("rejects additions inserted before the tail spacer", () => {
    const fixture = makeSessionFixture([100, 100]);
    const insertedBubble = createBubble("Bubble 2");
    const bottomSpacer = fixture.transcriptRoot.querySelector(
      "[data-cgpt-bottom-spacer]",
    );

    if (bottomSpacer === null) {
      throw new Error("bottom spacer fixture is missing");
    }

    fixture.transcriptRoot.insertBefore(insertedBubble, bottomSpacer);

    expect(
      validateTailAppendMutations(
        fixture.sessionState.records,
        fixture.transcriptRoot,
        [makeChildListMutationRecord(fixture.transcriptRoot, [insertedBubble])],
        isTranscriptBubble,
      ),
    ).toEqual({
      kind: "invalid",
      reason: "append-non-tail",
    });
  });

  it("rejects removals from the transcript root", () => {
    const fixture = makeSessionFixture([100, 100]);
    const removedBubble = fixture.bubbles[1]!;

    fixture.transcriptRoot.removeChild(removedBubble);

    expect(
      validateTailAppendMutations(
        fixture.sessionState.records,
        fixture.transcriptRoot,
        [
          makeChildListMutationRecord(
            fixture.transcriptRoot,
            [],
            [removedBubble],
          ),
        ],
        isTranscriptBubble,
      ),
    ).toEqual({
      kind: "invalid",
      reason: "append-removal",
    });
  });
});

describe("createAppendObserverManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("observes the transcript root with childList mutations only", () => {
    const fixture = makeSessionFixture([100, 100]);
    const observe = vi.fn();

    createAppendObserverManager(fixture.sessionState, {
      createMutationObserver() {
        return {
          disconnect() {},
          observe,
          takeRecords() {
            return [];
          },
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild() {},
      schedulePatch() {
        return false;
      },
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    });

    expect(observe).toHaveBeenCalledWith(fixture.transcriptRoot, {
      childList: true,
    });
  });

  it("batches valid tail appends and keeps detached mode when not near bottom", () => {
    const fixture = makeSessionFixture([100, 100], {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 599,
    });
    const schedulePatch = vi.fn(() => true);
    let callback: MutationCallback | null = null;

    const manager = createAppendObserverManager(fixture.sessionState, {
      clearTimeout: window.clearTimeout.bind(window),
      createMutationObserver(nextCallback) {
        callback = nextCallback;

        return {
          disconnect() {},
          observe() {},
          takeRecords() {
            return [];
          },
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild() {},
      schedulePatch,
      setTimeout: window.setTimeout.bind(window),
    });

    const bubbleA = createBubble("Bubble 2");
    const bubbleB = createBubble("Bubble 3");

    fixture.measuredHeights.set(bubbleA, 125);
    fixture.measuredHeights.set(bubbleB, 75);
    fixture.transcriptRoot.append(bubbleA);
    callback?.(
      [makeChildListMutationRecord(fixture.transcriptRoot, [bubbleA])],
      {} as MutationObserver,
    );

    fixture.transcriptRoot.append(bubbleB);
    callback?.(
      [makeChildListMutationRecord(fixture.transcriptRoot, [bubbleB])],
      {} as MutationObserver,
    );

    expect(fixture.sessionState.records).toHaveLength(2);

    vi.advanceTimersByTime(APPEND_QUIET_PERIOD_MS - 1);
    expect(fixture.sessionState.records).toHaveLength(2);

    vi.advanceTimersByTime(1);

    expect(fixture.sessionState.records).toHaveLength(4);
    expect(fixture.sessionState.records[2]).toMatchObject({
      index: 2,
      measuredHeight: 125,
      mounted: false,
      node: bubbleA,
      pinned: false,
    });
    expect(fixture.sessionState.records[3]).toMatchObject({
      index: 3,
      measuredHeight: 75,
      mounted: false,
      node: bubbleB,
      pinned: false,
    });
    expect(fixture.sessionState.prefixSums).toEqual([100, 200, 325, 400]);
    expect(schedulePatch).toHaveBeenCalledTimes(1);
    expect(schedulePatch).toHaveBeenCalledWith({ force: true });

    manager.disconnect();
  });

  it("adds an exact-bottom snap after patching when the viewport is near bottom", () => {
    const fixture = makeSessionFixture([100, 100], {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 600,
    });
    const schedulePatch = vi.fn(() => true);
    let callback: MutationCallback | null = null;

    createAppendObserverManager(fixture.sessionState, {
      clearTimeout: window.clearTimeout.bind(window),
      createMutationObserver(nextCallback) {
        callback = nextCallback;

        return {
          disconnect() {},
          observe() {},
          takeRecords() {
            return [];
          },
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild() {},
      schedulePatch,
      setTimeout: window.setTimeout.bind(window),
    });

    const bubble = createBubble("Bubble 2");

    fixture.measuredHeights.set(bubble, 100);
    fixture.transcriptRoot.append(bubble);
    callback?.(
      [makeChildListMutationRecord(fixture.transcriptRoot, [bubble])],
      {} as MutationObserver,
    );

    vi.advanceTimersByTime(APPEND_QUIET_PERIOD_MS);

    expect(schedulePatch).toHaveBeenCalledTimes(1);
    expect(schedulePatch).toHaveBeenCalledWith({
      afterPatch: expect.any(Function),
      force: true,
    });

    const options = schedulePatch.mock.calls[0]?.[0];

    if (options?.afterPatch === undefined) {
      throw new Error("expected a near-bottom afterPatch callback");
    }

    options.afterPatch(fixture.sessionState);

    expect(fixture.sessionState.records).toHaveLength(3);
    expect(fixture.scrollContainer.scrollTop).toBe(800);
  });

  it("keeps pending append batches buffered until streaming ends", () => {
    const fixture = makeSessionFixture([100, 100], {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 599,
    });
    const schedulePatch = vi.fn(() => true);
    let callback: MutationCallback | null = null;

    fixture.sessionState.isStreaming = true;

    const manager = createAppendObserverManager(fixture.sessionState, {
      clearTimeout: window.clearTimeout.bind(window),
      createMutationObserver(nextCallback) {
        callback = nextCallback;

        return {
          disconnect() {},
          observe() {},
          takeRecords() {
            return [];
          },
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild() {},
      schedulePatch,
      setTimeout: window.setTimeout.bind(window),
    });

    const bubble = createBubble("Bubble 2");

    fixture.measuredHeights.set(bubble, 100);
    fixture.transcriptRoot.append(bubble);
    callback?.(
      [makeChildListMutationRecord(fixture.transcriptRoot, [bubble])],
      {} as MutationObserver,
    );

    vi.advanceTimersByTime(APPEND_QUIET_PERIOD_MS);

    expect(fixture.sessionState.records).toHaveLength(2);
    expect(schedulePatch).not.toHaveBeenCalled();

    fixture.sessionState.isStreaming = false;
    manager.flushPendingAppends();

    expect(fixture.sessionState.records).toHaveLength(3);
    expect(schedulePatch).toHaveBeenCalledTimes(1);
    expect(schedulePatch).toHaveBeenCalledWith({ force: true });
  });

  it("requests a dirty rebuild for invalid append patterns and clears pending appends", () => {
    const fixture = makeSessionFixture([100, 100]);
    const requestDirtyRebuild = vi.fn();
    let callback: MutationCallback | null = null;

    createAppendObserverManager(fixture.sessionState, {
      clearTimeout: window.clearTimeout.bind(window),
      createMutationObserver(nextCallback) {
        callback = nextCallback;

        return {
          disconnect() {},
          observe() {},
          takeRecords() {
            return [];
          },
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild,
      schedulePatch() {
        return false;
      },
      setTimeout: window.setTimeout.bind(window),
    });

    const bubble = createBubble("Bubble 2");

    fixture.measuredHeights.set(bubble, 100);
    fixture.transcriptRoot.append(bubble);
    callback?.(
      [makeChildListMutationRecord(fixture.transcriptRoot, [bubble])],
      {} as MutationObserver,
    );

    const removedBubble = fixture.bubbles[1]!;
    fixture.transcriptRoot.removeChild(removedBubble);
    callback?.(
      [
        makeChildListMutationRecord(
          fixture.transcriptRoot,
          [],
          [removedBubble],
        ),
      ],
      {} as MutationObserver,
    );

    vi.advanceTimersByTime(APPEND_QUIET_PERIOD_MS);

    expect(requestDirtyRebuild).toHaveBeenCalledWith(
      fixture.sessionState,
      "append-removal",
    );
    expect(fixture.sessionState.records).toHaveLength(2);
    expect(fixture.sessionState.prefixSums).toEqual([100, 200]);
  });

  it("can discard queued internal mutation records after a virtualizer patch", () => {
    const fixture = makeSessionFixture([100, 100]);
    const takeRecords = vi.fn(() => []);

    const manager = createAppendObserverManager(fixture.sessionState, {
      clearTimeout: window.clearTimeout.bind(window),
      createMutationObserver() {
        return {
          disconnect() {},
          observe() {},
          takeRecords,
        };
      },
      isTranscriptBubble,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0;
      },
      requestDirtyRebuild() {},
      schedulePatch() {
        return false;
      },
      setTimeout: window.setTimeout.bind(window),
    });

    manager.flushPendingMutationRecords();

    expect(takeRecords).toHaveBeenCalledTimes(1);
  });
});

function makeSessionFixture(
  heights: number[],
  options: {
    clientHeight?: number;
    scrollHeight?: number;
    scrollTop?: number;
  } = {},
): {
  bubbles: HTMLElement[];
  measuredHeights: Map<Element, number>;
  scrollContainer: HTMLElement;
  sessionState: TranscriptSessionState;
  transcriptRoot: HTMLElement;
} {
  document.body.innerHTML = "";

  const transcriptRoot = document.createElement("section");
  const scrollContainer = document.createElement("main");
  const measuredHeights = new Map<Element, number>();
  const bubbles = heights.map((height, index) => {
    const bubble = createBubble(`Bubble ${index}`);

    measuredHeights.set(bubble, height);
    transcriptRoot.append(bubble);
    return bubble;
  });

  const topSpacer = document.createElement("div");
  topSpacer.setAttribute("data-cgpt-top-spacer", "");
  const bottomSpacer = document.createElement("div");
  bottomSpacer.setAttribute("data-cgpt-bottom-spacer", "");

  transcriptRoot.insertBefore(topSpacer, transcriptRoot.firstChild);
  transcriptRoot.append(bottomSpacer);

  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: options.clientHeight ?? 200,
  });
  Object.defineProperty(scrollContainer, "scrollHeight", {
    configurable: true,
    value: options.scrollHeight ?? Math.max(0, heights.length * 100 + 200),
  });
  scrollContainer.scrollTop = options.scrollTop ?? 0;

  scrollContainer.append(transcriptRoot);
  document.body.append(scrollContainer);

  const records = bubbles.map(
    (bubble, index): BubbleRecord => ({
      index,
      measuredHeight: heights[index] ?? 0,
      mounted: index === 0,
      node: bubble,
      pinned: false,
    }),
  );

  return {
    bubbles,
    measuredHeights,
    scrollContainer,
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      isStreaming: false,
      mountedRange: { end: 0, start: 0 },
      pendingScrollCorrection: 0,
      prefixSums: buildPrefixSums(heights),
      records,
      scrollContainer,
      transcriptRoot,
    },
    transcriptRoot,
  };
}

function createBubble(label: string): HTMLElement {
  const bubble = document.createElement("article");

  bubble.setAttribute("data-cgpt-transcript-bubble", "");
  bubble.textContent = label;

  return bubble;
}

function isTranscriptBubble(node: Node): node is Element {
  return (
    node instanceof Element && node.matches("[data-cgpt-transcript-bubble]")
  );
}

function makeChildListMutationRecord(
  target: HTMLElement,
  addedNodes: Node[],
  removedNodes: Node[] = [],
): MutationRecord {
  return {
    addedNodes: addedNodes as unknown as NodeList,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: removedNodes as unknown as NodeList,
    target,
    type: "childList",
  } as MutationRecord;
}

function buildPrefixSums(heights: number[]): number[] {
  return heights.reduce<number[]>((prefixSums, height) => {
    const previous = prefixSums[prefixSums.length - 1] ?? 0;

    prefixSums.push(previous + height);
    return prefixSums;
  }, []);
}
