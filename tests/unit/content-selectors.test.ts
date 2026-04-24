// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  CONTENT_SELECTOR_REGISTRY,
  resolveSelectors,
  type ContentSelectorRegistry,
} from "../../src/content/selectors.ts";

function makeDocument(selectors: readonly string[]): Document {
  const doc = document.implementation.createHTMLDocument();
  for (const selector of selectors) {
    // 속성 선택자 [data-foo="bar"] 또는 [data-foo] 형태를 지원한다
    const match = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (match) {
      const el = doc.createElement("div");
      el.setAttribute(match[1], match[2] ?? "");
      doc.body.appendChild(el);
    }
  }
  return doc;
}

const BASE: ContentSelectorRegistry = {
  bubble: "[data-cgpt-transcript-bubble]",
  scrollContainer: "[data-cgpt-scroll-container]",
  streamingIndicator: "[data-cgpt-streaming-indicator]",
  transcriptRoot: "[data-cgpt-transcript-root]",
};

describe("resolveSelectors", () => {
  it("returns null when the scroll container is missing", () => {
    const doc = makeDocument(["[data-cgpt-transcript-root]"]);

    expect(resolveSelectors(doc)).toBeNull();
  });

  it("returns null when the transcript root is missing", () => {
    const doc = makeDocument(["[data-cgpt-scroll-container]"]);

    expect(resolveSelectors(doc)).toBeNull();
  });

  it("returns the resolved elements when both are present", () => {
    const doc = makeDocument([
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const result = resolveSelectors(doc);

    expect(result).not.toBeNull();
    expect(result?.scrollContainer).toBe(
      doc.querySelector<HTMLElement>("[data-cgpt-scroll-container]"),
    );
    expect(result?.transcriptRoot).toBe(
      doc.querySelector<HTMLElement>("[data-cgpt-transcript-root]"),
    );
    expect(result?.bubbleSelector).toBe(CONTENT_SELECTOR_REGISTRY.bubble);
    expect(result?.streamingIndicatorSelector).toBe(
      CONTENT_SELECTOR_REGISTRY.streamingIndicator,
    );
  });

  it("uses the provided registry instead of the default", () => {
    const customRegistry: ContentSelectorRegistry = {
      bubble: "[data-test-bubble]",
      scrollContainer: "[data-test-scroll]",
      streamingIndicator: "[data-test-streaming]",
      transcriptRoot: "[data-test-root]",
    };
    const doc = makeDocument(["[data-test-scroll]", "[data-test-root]"]);

    const result = resolveSelectors(doc, customRegistry);

    expect(result).not.toBeNull();
    expect(result?.scrollContainer).toBe(
      doc.querySelector<HTMLElement>("[data-test-scroll]"),
    );
    expect(result?.transcriptRoot).toBe(
      doc.querySelector<HTMLElement>("[data-test-root]"),
    );
    expect(result?.bubbleSelector).toBe(customRegistry.bubble);
    expect(result?.streamingIndicatorSelector).toBe(
      customRegistry.streamingIndicator,
    );

    // Default registry selectors should not match elements built for the custom registry.
    expect(resolveSelectors(doc)).toBeNull();
  });

  it("단일 문자열은 기존과 동일하게 동작한다", () => {
    const doc = makeDocument([
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const result = resolveSelectors(doc, BASE);

    expect(result).not.toBeNull();
    expect(result!.bubbleSelector).toBe("[data-cgpt-transcript-bubble]");
    expect(result!.streamingIndicatorSelector).toBe(
      "[data-cgpt-streaming-indicator]",
    );
  });

  it("배열에서 첫 번째 후보가 DOM에 있으면 첫 번째를 사용한다", () => {
    const doc = makeDocument([
      "[data-first]",
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const registry: ContentSelectorRegistry = {
      ...BASE,
      scrollContainer: ["[data-first]", "[data-second]"],
    };

    const result = resolveSelectors(doc, registry);

    expect(result).not.toBeNull();
    expect(result!.scrollContainer).toBe(
      doc.querySelector<HTMLElement>("[data-first]"),
    );
  });

  it("배열에서 첫 번째 후보가 없고 두 번째가 있으면 두 번째를 사용한다", () => {
    const doc = makeDocument([
      "[data-second]",
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const registry: ContentSelectorRegistry = {
      ...BASE,
      scrollContainer: ["[data-first]", "[data-second]"],
    };

    const result = resolveSelectors(doc, registry);

    expect(result).not.toBeNull();
    expect(result!.scrollContainer).toBe(
      doc.querySelector<HTMLElement>("[data-second]"),
    );
  });

  it("배열의 모든 후보가 DOM에 없으면 null을 반환한다", () => {
    const doc = makeDocument(["[data-cgpt-transcript-root]"]);

    const registry: ContentSelectorRegistry = {
      ...BASE,
      scrollContainer: ["[data-first]", "[data-second]"],
    };

    const result = resolveSelectors(doc, registry);

    expect(result).toBeNull();
  });

  it("bubble이 배열이면 쉼표로 결합된 복합 선택자를 반환한다", () => {
    const doc = makeDocument([
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const registry: ContentSelectorRegistry = {
      ...BASE,
      bubble: ["[data-real-bubble]", "[data-cgpt-transcript-bubble]"],
    };

    const result = resolveSelectors(doc, registry);

    expect(result).not.toBeNull();
    expect(result!.bubbleSelector).toBe(
      "[data-real-bubble],[data-cgpt-transcript-bubble]",
    );
  });

  it("streamingIndicator가 배열이면 쉼표로 결합된 복합 선택자를 반환한다", () => {
    const doc = makeDocument([
      "[data-cgpt-scroll-container]",
      "[data-cgpt-transcript-root]",
    ]);

    const registry: ContentSelectorRegistry = {
      ...BASE,
      streamingIndicator: [
        "[data-real-indicator]",
        "[data-cgpt-streaming-indicator]",
      ],
    };

    const result = resolveSelectors(doc, registry);

    expect(result).not.toBeNull();
    expect(result!.streamingIndicatorSelector).toBe(
      "[data-real-indicator],[data-cgpt-streaming-indicator]",
    );
  });
});
