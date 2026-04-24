// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { bootstrapContentScript } from "../../src/content/bootstrap.ts";
import { DEBUG_SESSION_STORAGE_KEY } from "../../src/content/debug.ts";
import { resolveAvailability } from "../../src/content/availability.ts";
import {
  CONTENT_SELECTOR_REGISTRY,
  resolveSelectors,
} from "../../src/content/selectors.ts";

describe("content availability", () => {
  it("treats unsupported routes as idle", () => {
    expect(resolveAvailability("/g/example", null)).toBe("idle");
  });

  it("treats supported routes with missing selectors as unavailable", () => {
    expect(resolveAvailability("/c/example", null)).toBe("unavailable");
  });

  it("treats supported routes with resolved selectors as available", () => {
    expect(
      resolveAvailability("/c/example", {
        bubbleSelector: CONTENT_SELECTOR_REGISTRY.bubble,
        scrollContainer: {} as HTMLElement,
        streamingIndicatorSelector:
          CONTENT_SELECTOR_REGISTRY.streamingIndicator,
        transcriptRoot: {} as HTMLElement,
      }),
    ).toBe("available");
  });
});

describe("selector resolution", () => {
  it("returns null when required selectors are missing", () => {
    const document = {
      querySelector() {
        return null;
      },
    } as unknown as Document;

    expect(resolveSelectors(document)).toBeNull();
  });

  it("skips selector lookup on unsupported routes", () => {
    const reports: unknown[] = [];
    const document = {
      querySelector() {
        throw new Error("비대상 경로에서 선택자를 조회하면 안 됩니다.");
      },
    } as unknown as Document;

    const result = bootstrapContentScript({
      document,
      pathname: "/g/example",
      reportAvailability(message) {
        reports.push(message);
      },
    });

    expect(result.availability).toBe("idle");
    expect(result.scanResult).toBeNull();
    expect(result.sessionState).toBeNull();

    expect(reports).toEqual([
      {
        availability: "idle",
        type: "runtime/report-content-availability",
      },
    ]);
  });
});

function createNoopResizeObserver() {
  return {
    disconnect() {},
    observe() {},
    unobserve() {},
  };
}

function makeDocumentWithBubbles(bubbleCount: number): Document {
  const transcriptRoot = document.createElement("section");
  transcriptRoot.setAttribute("data-cgpt-transcript-root", "");

  for (let i = 0; i < bubbleCount; i++) {
    const bubble = document.createElement("article");
    bubble.setAttribute("data-cgpt-transcript-bubble", "");
    transcriptRoot.append(bubble);
  }

  const scrollContainer = document.createElement("main");
  scrollContainer.setAttribute("data-cgpt-scroll-container", "");

  const body = document.createElement("body");
  body.append(scrollContainer, transcriptRoot);

  return {
    querySelector(selector: string) {
      return body.querySelector(selector);
    },
  } as unknown as Document;
}

describe("transcript scan integration", () => {
  it("returns null scanResult for unsupported routes", () => {
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(50),
      pathname: "/g/example",
      reportAvailability() {},
    });

    expect(result.scanResult).toBeNull();
    expect(result.sessionState).toBeNull();
  });

  it("returns null scanResult when selectors are missing", () => {
    const emptyDoc = {
      querySelector() {
        return null;
      },
    } as unknown as Document;

    const result = bootstrapContentScript({
      document: emptyDoc,
      pathname: "/c/example",
      reportAvailability() {},
    });

    expect(result.availability).toBe("unavailable");
    expect(result.scanResult).toBeNull();
    expect(result.sessionState).toBeNull();
  });

  it("returns scanResult with activationEligible=false for 0 bubbles", () => {
    const reports: unknown[] = [];
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(0),
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
    });

    expect(result.availability).toBe("inactive");
    expect(result.scanResult).not.toBeNull();
    expect(result.sessionState).toBeNull();
    expect(result.scanResult?.bubbleCount).toBe(0);
    expect(result.scanResult?.activationEligible).toBe(false);
    expect(reports).toEqual([
      {
        availability: "inactive",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("returns scanResult with activationEligible=false for 49 bubbles", () => {
    const reports: unknown[] = [];
    const result = bootstrapContentScript({
      document: makeDocumentWithBubbles(49),
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
    });

    expect(result.availability).toBe("inactive");
    expect(result.sessionState).toBeNull();
    expect(result.scanResult?.bubbleCount).toBe(49);
    expect(result.scanResult?.activationEligible).toBe(false);
    expect(reports).toEqual([
      {
        availability: "inactive",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("returns scanResult with activationEligible=true for 50 bubbles", () => {
    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: makeDocumentWithBubbles(50),
      pathname: "/c/example",
      reportAvailability() {},
    });

    expect(result.availability).toBe("available");
    expect(result.scanResult?.bubbleCount).toBe(50);
    expect(result.scanResult?.activationEligible).toBe(true);
  });

  it("creates ordered session state with measured heights for eligible transcripts", () => {
    const bubbleHeights = Array.from({ length: 50 }, (_, index) => index + 0.5);
    const fixture = makeMeasuredDocumentFixture(bubbleHeights, {
      viewportHeight: 2_500,
    });

    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: fixture.document,
      pathname: "/c/example",
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0);
        return 1;
      },
    });

    expect(result.availability).toBe("available");
    expect(result.sessionState).not.toBeNull();
    expect(result.sessionState?.transcriptRoot).toBe(fixture.transcriptRoot);
    expect(result.sessionState?.scrollContainer).toBe(fixture.scrollContainer);
    expect(result.sessionState?.mountedRange).toEqual({ start: 0, end: 49 });
    expect(result.sessionState?.records).toHaveLength(50);
    expect(result.sessionState?.records[0]).toMatchObject({
      index: 0,
      measuredHeight: 0.5,
      mounted: true,
      pinned: false,
    });
    expect(result.sessionState?.records[1]).toMatchObject({
      index: 1,
      measuredHeight: 1.5,
      mounted: true,
      pinned: false,
    });
    expect(result.sessionState?.records[49]).toMatchObject({
      index: 49,
      measuredHeight: 49.5,
      mounted: true,
      pinned: false,
    });
    expect(result.sessionState?.records[0]?.node).toBe(fixture.bubbles[0]);
    expect(result.sessionState?.records[1]?.node).toBe(fixture.bubbles[1]);
    expect(result.sessionState?.records[49]?.node).toBe(fixture.bubbles[49]);
    expect(result.sessionState?.prefixSums[0]).toBe(0.5);
    expect(result.sessionState?.prefixSums[1]).toBe(2);
    expect(result.sessionState?.prefixSums[49]).toBe(1250);
    expect(Array.from(fixture.transcriptRoot.children).at(0)).toBe(
      fixture.transcriptRoot.querySelector("[data-cgpt-top-spacer]"),
    );
    expect(Array.from(fixture.transcriptRoot.children).at(-1)).toBe(
      fixture.transcriptRoot.querySelector("[data-cgpt-bottom-spacer]"),
    );
  });

  it("computes an initial mounted range from the scroll viewport instead of mounting the full transcript", () => {
    const bubbleHeights = Array.from({ length: 50 }, () => 100);
    const fixture = makeMeasuredDocumentFixture(bubbleHeights, {
      viewportHeight: 200,
    });

    const result = bootstrapContentScript({
      createResizeObserver: createNoopResizeObserver,
      document: fixture.document,
      pathname: "/c/example",
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0);
        return 1;
      },
    });

    expect(result.sessionState?.mountedRange).toEqual({ start: 0, end: 3 });
    expect(
      result.sessionState?.records
        .slice(0, 4)
        .every((record) => record.mounted),
    ).toBe(true);
    expect(
      result.sessionState?.records.slice(4).every((record) => !record.mounted),
    ).toBe(true);
    expect(Array.from(fixture.transcriptRoot.children)).toHaveLength(6);
  });

  it("debug mode가 켜져 있으면 초기 patch metrics를 기록한다", () => {
    const bubbleHeights = Array.from({ length: 50 }, () => 100);
    const fixture = makeMeasuredDocumentFixture(bubbleHeights, {
      viewportHeight: 200,
    });
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    window.sessionStorage.setItem(DEBUG_SESSION_STORAGE_KEY, "1");

    try {
      bootstrapContentScript({
        createResizeObserver: createNoopResizeObserver,
        document: fixture.document,
        pathname: "/c/example",
        reportAvailability() {},
        requestAnimationFrame(callback) {
          callback(0);
          return 1;
        },
      });

      expect(debugSpy).toHaveBeenCalledWith(
        "[cgpt-virtualizer]",
        "patch-applied",
        expect.objectContaining({
          directChildCount: 6,
          mountedBubbleCount: 4,
          mountedRange: { end: 3, start: 0 },
        }),
      );
    } finally {
      window.sessionStorage.removeItem(DEBUG_SESSION_STORAGE_KEY);
      debugSpy.mockRestore();
    }
  });

  it("memory guard 임계값을 넘으면 세션을 정리하고 탭 비활성화를 요청한다", () => {
    const disableVirtualizationForMemoryGuard = vi.fn();
    const mutationObservers: MockMutationObserverEntry[] = [];
    const fixture = makeLiveMeasuredDocumentFixture(
      Array.from({ length: 50 }, () => 100),
      {
        viewportHeight: 200,
      },
    );

    const result = bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      disableVirtualizationForMemoryGuard,
      document,
      memoryGuardThreshold: {
        detachedNodeCount: 1,
        estimatedDetachedHeight: 1,
      },
      pathname: "/c/example",
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0);
        return 1;
      },
    });

    expect(disableVirtualizationForMemoryGuard).toHaveBeenCalledTimes(1);
    expect(result.sessionState?.records).toHaveLength(0);
    expect(result.sessionState?.mountedRange).toBeNull();
    expect(
      fixture.transcriptRoot.querySelector("[data-cgpt-top-spacer]"),
    ).toBeNull();
    expect(
      fixture.transcriptRoot.querySelector("[data-cgpt-bottom-spacer]"),
    ).toBeNull();
    expect(
      fixture.transcriptRoot.querySelectorAll("[data-cgpt-transcript-bubble]"),
    ).toHaveLength(50);
  });

  it("reports unavailable and becomes inert when selectors disappear mid-session", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const requestAnimationFrame = vi.fn(() => 1);
    const fixture = makeLiveMeasuredDocumentFixture(
      Array.from({ length: 50 }, () => 100),
      {
        viewportHeight: 200,
      },
    );

    const result = bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      requestAnimationFrame,
    });

    const selectorFailureObserver = mutationObservers.find((entry) =>
      entry.observe.mock.calls.some(
        ([target, options]) =>
          target === document.body &&
          typeof options === "object" &&
          options !== null &&
          "childList" in options &&
          options.childList === true &&
          "subtree" in options &&
          options.subtree === true,
      ),
    );

    expect(result.availability).toBe("available");
    expect(selectorFailureObserver).toBeDefined();
    expect(result.sessionState).not.toBeNull();
    expect(reports).toEqual([
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
    ]);

    document.body.innerHTML = "<main data-cgpt-scroll-container></main>";
    selectorFailureObserver?.callback(
      [
        makeChildListMutationRecord(
          document.body,
          Array.from(document.body.childNodes),
          [fixture.scrollContainer, fixture.streamingIndicator],
        ),
      ],
      {} as MutationObserver,
    );

    expect(reports).toEqual([
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
    expect(result.sessionState?.records).toHaveLength(0);

    const rafCallCount = requestAnimationFrame.mock.calls.length;
    fixture.scrollContainer.dispatchEvent(new Event("scroll"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(rafCallCount);
  });
});

describe("startup discovery phase", () => {
  const DISCOVERY_TIMEOUT_MS = 10_000;

  function makeEmptyDoc(): Document {
    const body = document.createElement("body");
    return {
      body,
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
      documentElement: document.documentElement,
    } as unknown as Document;
  }

  function addSelectorsAndBubbles(
    doc: Document,
    bubbleCount: number,
    viewportHeight = 200,
  ): {
    scrollContainer: HTMLElement;
    transcriptRoot: HTMLElement;
    bubbles: HTMLElement[];
  } {
    const body = (doc as unknown as { body: HTMLElement }).body;
    const scrollContainer = document.createElement("main");
    scrollContainer.setAttribute("data-cgpt-scroll-container", "");
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: viewportHeight,
    });
    const transcriptRoot = document.createElement("section");
    transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
    const streamingIndicator = document.createElement("div");
    streamingIndicator.setAttribute("data-cgpt-streaming-indicator", "");
    streamingIndicator.setAttribute("hidden", "");
    const bubbles: HTMLElement[] = [];

    for (let i = 0; i < bubbleCount; i++) {
      const bubble = document.createElement("article");
      bubble.setAttribute("data-cgpt-transcript-bubble", "");
      bubble.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
      transcriptRoot.append(bubble);
      bubbles.push(bubble);
    }

    scrollContainer.append(transcriptRoot);
    body.append(scrollContainer, streamingIndicator);
    return { scrollContainer, transcriptRoot, bubbles };
  }

  it("selector miss → DOM appears before timeout → reports unavailable first, then available", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();

    const result = bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
    expect(result.availability).toBe("unavailable");

    // Simulate DOM becoming ready
    addSelectorsAndBubbles(doc, 50);

    // Find the discovery observer and fire its callback
    const discoveryObserver = mutationObservers[0];
    expect(discoveryObserver).toBeDefined();
    discoveryObserver?.callback([], {} as MutationObserver);

    // Session should now be established and "available" reported
    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("selector miss → DOM becomes eligible while discovery observer is attaching → session starts immediately", () => {
    const reports: unknown[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();

    const result = bootstrapContentScript({
      createMutationObserver() {
        return {
          disconnect() {},
          observe() {
            addSelectorsAndBubbles(doc, 50);
          },
          takeRecords() {
            return [];
          },
        };
      },
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    expect(reports).toEqual([
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
    ]);
    expect(result.sessionState).not.toBeNull();
  });

  it("selector miss → timeout fires before DOM appears → Unavailable reported", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();

    bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.delay).toBe(DISCOVERY_TIMEOUT_MS);

    // Fire the timeout — DOM still not ready
    timeouts[0]?.callback();

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("selector miss → delayed short transcript reports inactive and never degrades to Unavailable", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();

    bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    addSelectorsAndBubbles(doc, 49);

    mutationObservers[0]?.callback([], {} as MutationObserver);

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
      { availability: "inactive", type: "runtime/report-content-availability" },
    ]);

    timeouts[0]?.callback();

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
      { availability: "inactive", type: "runtime/report-content-availability" },
    ]);
  });

  it("inactive (< 50 bubbles) → more bubbles added → session established", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();
    const { transcriptRoot } = addSelectorsAndBubbles(doc, 0);

    bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    // "inactive" reported immediately
    expect(reports).toEqual([
      { availability: "inactive", type: "runtime/report-content-availability" },
    ]);

    // Add enough bubbles
    for (let i = 0; i < 50; i++) {
      const bubble = document.createElement("article");
      bubble.setAttribute("data-cgpt-transcript-bubble", "");
      bubble.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
      transcriptRoot.append(bubble);
    }

    // Find the discovery observer (not the session observers) and fire it
    // The discovery observer is distinct from the session observers
    const discoveryObserver = mutationObservers.find((entry) =>
      entry.observe.mock.calls.some(
        ([, options]) =>
          typeof options === "object" &&
          options !== null &&
          "childList" in options &&
          options.childList === true,
      ),
    );
    expect(discoveryObserver).toBeDefined();
    discoveryObserver?.callback([], {} as MutationObserver);

    // Session should now be "available"
    expect(reports).toEqual([
      { availability: "inactive", type: "runtime/report-content-availability" },
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("destroy() during discovery cleans up observer and timeout without reporting Unavailable", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const clearedTimeouts: number[] = [];
    const doc = makeEmptyDoc();

    const result = bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout(handle) {
        clearedTimeouts.push(handle);
      },
    });

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
    expect(mutationObservers).toHaveLength(1);

    result.destroy();

    // Observer should be disconnected
    expect(mutationObservers[0]?.disconnect).toHaveBeenCalledTimes(1);
    // Timeout should be cleared
    expect(clearedTimeouts).toHaveLength(1);
    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);

    // Firing the timeout after destroy should not report anything else
    timeouts[0]?.callback();
    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
    ]);
  });

  it("destroy() after delayed activation tears down the established session", () => {
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const doc = makeEmptyDoc();

    const result = bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: doc,
      pathname: "/c/example",
      reportAvailability() {},
      requestAnimationFrame(callback) {
        callback(0);
        return 1;
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    const { transcriptRoot } = addSelectorsAndBubbles(doc, 50);

    mutationObservers[0]?.callback([], {} as MutationObserver);

    expect(
      transcriptRoot.querySelector("[data-cgpt-top-spacer]"),
    ).not.toBeNull();
    expect(
      transcriptRoot.querySelector("[data-cgpt-bottom-spacer]"),
    ).not.toBeNull();

    result.destroy();

    expect(transcriptRoot.querySelector("[data-cgpt-top-spacer]")).toBeNull();
    expect(
      transcriptRoot.querySelector("[data-cgpt-bottom-spacer]"),
    ).toBeNull();
    expect(
      transcriptRoot.querySelectorAll("[data-cgpt-transcript-bubble]"),
    ).toHaveLength(50);
  });

  it("selector miss → attribute-only selector activation is observed during discovery", () => {
    const reports: unknown[] = [];
    const mutationObservers: MockMutationObserverEntry[] = [];
    const timeouts: Array<{ callback: () => void; delay: number }> = [];
    const fixture = makePendingSelectorDoc(50);

    bootstrapContentScript({
      createMutationObserver:
        createMockMutationObserverFactory(mutationObservers),
      createResizeObserver: createNoopResizeObserver,
      document: fixture.document,
      pathname: "/c/example",
      reportAvailability(message) {
        reports.push(message);
      },
      setTimeout(callback, delay) {
        timeouts.push({ callback, delay });
        return timeouts.length;
      },
      clearTimeout: vi.fn(),
    });

    expect(mutationObservers[0]?.observe).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        attributeFilter: [
          "data-cgpt-transcript-bubble",
          "data-cgpt-scroll-container",
          "data-cgpt-transcript-root",
        ],
        attributes: true,
        childList: true,
        subtree: true,
      }),
    );

    fixture.scrollContainer.setAttribute("data-cgpt-scroll-container", "");
    fixture.transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
    for (const bubble of fixture.bubbles) {
      bubble.setAttribute("data-cgpt-transcript-bubble", "");
    }

    mutationObservers[0]?.callback(
      [
        makeAttributesMutationRecord(
          fixture.scrollContainer,
          "data-cgpt-scroll-container",
        ),
        makeAttributesMutationRecord(
          fixture.transcriptRoot,
          "data-cgpt-transcript-root",
        ),
        makeAttributesMutationRecord(
          fixture.bubbles[0] as HTMLElement,
          "data-cgpt-transcript-bubble",
        ),
      ],
      {} as MutationObserver,
    );

    expect(reports).toEqual([
      {
        availability: "unavailable",
        type: "runtime/report-content-availability",
      },
      {
        availability: "available",
        type: "runtime/report-content-availability",
      },
    ]);
  });
});

function makeMeasuredDocumentFixture(bubbleHeights: number[]): {
  bubbles: HTMLElement[];
  document: Document;
  scrollContainer: HTMLElement;
  transcriptRoot: HTMLElement;
};
function makeMeasuredDocumentFixture(
  bubbleHeights: number[],
  options: {
    viewportHeight: number;
  },
): {
  bubbles: HTMLElement[];
  document: Document;
  scrollContainer: HTMLElement;
  transcriptRoot: HTMLElement;
} {
  const transcriptRoot = document.createElement("section");
  transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
  const scrollContainer = document.createElement("main");
  scrollContainer.setAttribute("data-cgpt-scroll-container", "");
  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: options.viewportHeight,
  });
  const bubbles = bubbleHeights.map((height) => {
    const bubble = document.createElement("article");
    bubble.setAttribute("data-cgpt-transcript-bubble", "");
    bubble.getBoundingClientRect = () => ({ height }) as DOMRect;
    transcriptRoot.append(bubble);
    return bubble;
  });
  const streamingIndicator = document.createElement("div");
  streamingIndicator.setAttribute("data-cgpt-streaming-indicator", "");
  streamingIndicator.setAttribute("hidden", "");

  const body = document.createElement("body");
  scrollContainer.append(transcriptRoot);
  body.append(scrollContainer, streamingIndicator);

  return {
    bubbles,
    document: {
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
    } as unknown as Document,
    scrollContainer,
    transcriptRoot,
  };
}

function makeLiveMeasuredDocumentFixture(
  bubbleHeights: number[],
  options: {
    viewportHeight: number;
  },
): {
  bubbles: HTMLElement[];
  scrollContainer: HTMLElement;
  streamingIndicator: HTMLElement;
  transcriptRoot: HTMLElement;
} {
  document.body.innerHTML = "";

  const transcriptRoot = document.createElement("section");
  transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
  const scrollContainer = document.createElement("main");
  scrollContainer.setAttribute("data-cgpt-scroll-container", "");
  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: options.viewportHeight,
  });
  const bubbles = bubbleHeights.map((height) => {
    const bubble = document.createElement("article");
    bubble.setAttribute("data-cgpt-transcript-bubble", "");
    bubble.getBoundingClientRect = () => ({ height }) as DOMRect;
    transcriptRoot.append(bubble);
    return bubble;
  });
  const streamingIndicator = document.createElement("div");
  streamingIndicator.setAttribute("data-cgpt-streaming-indicator", "");
  streamingIndicator.setAttribute("hidden", "");

  scrollContainer.append(transcriptRoot);
  document.body.append(scrollContainer, streamingIndicator);

  return {
    bubbles,
    scrollContainer,
    streamingIndicator,
    transcriptRoot,
  };
}

interface MockMutationObserverEntry {
  callback: MutationCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  takeRecords: ReturnType<typeof vi.fn>;
}

function createMockMutationObserverFactory(
  entries: MockMutationObserverEntry[],
): (callback: MutationCallback) => {
  disconnect(): void;
  observe(target: Node, options?: MutationObserverInit): void;
  takeRecords(): MutationRecord[];
} {
  return (callback) => {
    const entry: MockMutationObserverEntry = {
      callback,
      disconnect: vi.fn(),
      observe: vi.fn(),
      takeRecords: vi.fn(() => []),
    };

    entries.push(entry);

    return {
      disconnect: entry.disconnect,
      observe: entry.observe,
      takeRecords: entry.takeRecords,
    };
  };
}

function makeChildListMutationRecord(
  target: Node,
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

function makeAttributesMutationRecord(
  target: Node,
  attributeName: string,
): MutationRecord {
  return {
    addedNodes: [] as unknown as NodeList,
    attributeName,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: [] as unknown as NodeList,
    target,
    type: "attributes",
  } as MutationRecord;
}

function makePendingSelectorDoc(bubbleCount: number): {
  bubbles: HTMLElement[];
  document: Document;
  scrollContainer: HTMLElement;
  transcriptRoot: HTMLElement;
} {
  document.body.innerHTML = "";

  const scrollContainer = document.createElement("main");
  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: 200,
  });
  const transcriptRoot = document.createElement("section");
  const streamingIndicator = document.createElement("div");
  streamingIndicator.setAttribute("data-cgpt-streaming-indicator", "");
  streamingIndicator.setAttribute("hidden", "");
  const bubbles: HTMLElement[] = [];

  for (let i = 0; i < bubbleCount; i++) {
    const bubble = document.createElement("article");
    bubble.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
    transcriptRoot.append(bubble);
    bubbles.push(bubble);
  }

  scrollContainer.append(transcriptRoot);
  document.body.append(scrollContainer, streamingIndicator);

  return {
    bubbles,
    document,
    scrollContainer,
    transcriptRoot,
  };
}
