// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  CONTENT_SELECTOR_REGISTRY,
  resolveSelectors,
  type ContentSelectorRegistry,
} from "../../src/content/selectors.ts";

describe("resolveSelectors", () => {
  it("returns null when the scroll container is missing", () => {
    const body = document.createElement("body");
    const transcriptRoot = document.createElement("section");
    transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
    body.append(transcriptRoot);

    const doc = {
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
    } as unknown as Document;

    expect(resolveSelectors(doc)).toBeNull();
  });

  it("returns null when the transcript root is missing", () => {
    const body = document.createElement("body");
    const scrollContainer = document.createElement("main");
    scrollContainer.setAttribute("data-cgpt-scroll-container", "");
    body.append(scrollContainer);

    const doc = {
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
    } as unknown as Document;

    expect(resolveSelectors(doc)).toBeNull();
  });

  it("returns the resolved elements when both are present", () => {
    const body = document.createElement("body");
    const scrollContainer = document.createElement("main");
    scrollContainer.setAttribute("data-cgpt-scroll-container", "");
    const transcriptRoot = document.createElement("section");
    transcriptRoot.setAttribute("data-cgpt-transcript-root", "");
    body.append(scrollContainer, transcriptRoot);

    const doc = {
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
    } as unknown as Document;

    const result = resolveSelectors(doc);

    expect(result).not.toBeNull();
    expect(result?.scrollContainer).toBe(scrollContainer);
    expect(result?.transcriptRoot).toBe(transcriptRoot);
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

    const body = document.createElement("body");
    const scrollContainer = document.createElement("main");
    scrollContainer.setAttribute("data-test-scroll", "");
    const transcriptRoot = document.createElement("section");
    transcriptRoot.setAttribute("data-test-root", "");
    body.append(scrollContainer, transcriptRoot);

    const doc = {
      querySelector(selector: string) {
        return body.querySelector(selector);
      },
    } as unknown as Document;

    const result = resolveSelectors(doc, customRegistry);

    expect(result).not.toBeNull();
    expect(result?.scrollContainer).toBe(scrollContainer);
    expect(result?.transcriptRoot).toBe(transcriptRoot);
    expect(result?.bubbleSelector).toBe(customRegistry.bubble);
    expect(result?.streamingIndicatorSelector).toBe(
      customRegistry.streamingIndicator,
    );

    // Default registry selectors should not match elements built for the custom registry
    expect(resolveSelectors(doc)).toBeNull();
  });
});
