// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  collectTranscriptBubbles,
  isActivationEligible,
  scanTranscript,
} from "../../src/content/transcript-scan.ts";
import type { ResolvedContentSelectors } from "../../src/content/selectors.ts";

describe("isActivationEligible", () => {
  it("returns false for 0 bubbles", () => {
    expect(isActivationEligible(0)).toBe(false);
  });

  it("returns false for 49 bubbles", () => {
    expect(isActivationEligible(49)).toBe(false);
  });

  it("returns true for 50 bubbles", () => {
    expect(isActivationEligible(50)).toBe(true);
  });

  it("returns true for more than 50 bubbles", () => {
    expect(isActivationEligible(100)).toBe(true);
  });
});

describe("collectTranscriptBubbles", () => {
  it("returns empty array when no bubbles match", () => {
    const root = document.createElement("section");
    expect(
      collectTranscriptBubbles(root, "[data-cgpt-transcript-bubble]"),
    ).toEqual([]);
  });

  it("collects matched bubbles in DOM order", () => {
    const root = document.createElement("section");
    const a = document.createElement("article");
    const b = document.createElement("article");
    const c = document.createElement("article");
    a.setAttribute("data-cgpt-transcript-bubble", "");
    b.setAttribute("data-cgpt-transcript-bubble", "");
    c.setAttribute("data-cgpt-transcript-bubble", "");
    root.append(a, b, c);

    const result = collectTranscriptBubbles(
      root,
      "[data-cgpt-transcript-bubble]",
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
    expect(result[2]).toBe(c);
  });

  it("does not collect elements outside root", () => {
    const root = document.createElement("section");
    const outside = document.createElement("article");
    outside.setAttribute("data-cgpt-transcript-bubble", "");
    document.body.append(outside);

    const result = collectTranscriptBubbles(
      root,
      "[data-cgpt-transcript-bubble]",
    );

    expect(result).toHaveLength(0);
    outside.remove();
  });
});

function makeSelectors(bubbleCount: number): ResolvedContentSelectors {
  const transcriptRoot = document.createElement("section");
  const scrollContainer = document.createElement("main");

  for (let i = 0; i < bubbleCount; i++) {
    const bubble = document.createElement("article");
    bubble.setAttribute("data-cgpt-transcript-bubble", "");
    transcriptRoot.append(bubble);
  }

  return {
    bubbleSelector: "[data-cgpt-transcript-bubble]",
    scrollContainer: scrollContainer as HTMLElement,
    streamingIndicatorSelector: "[data-cgpt-streaming-indicator]",
    transcriptRoot: transcriptRoot as HTMLElement,
  };
}

describe("scanTranscript", () => {
  it("returns transcriptRoot from selectors", () => {
    const selectors = makeSelectors(0);
    const result = scanTranscript(selectors);
    expect(result.transcriptRoot).toBe(selectors.transcriptRoot);
  });

  it("returns correct count and eligible=false for 0 bubbles", () => {
    const result = scanTranscript(makeSelectors(0));
    expect(result.bubbleCount).toBe(0);
    expect(result.activationEligible).toBe(false);
    expect(result.bubbles).toHaveLength(0);
  });

  it("returns correct count and eligible=false for 49 bubbles", () => {
    const result = scanTranscript(makeSelectors(49));
    expect(result.bubbleCount).toBe(49);
    expect(result.activationEligible).toBe(false);
    expect(result.bubbles).toHaveLength(49);
  });

  it("returns correct count and eligible=true for 50 bubbles", () => {
    const result = scanTranscript(makeSelectors(50));
    expect(result.bubbleCount).toBe(50);
    expect(result.activationEligible).toBe(true);
    expect(result.bubbles).toHaveLength(50);
  });

  it("bubbles are in DOM order", () => {
    const selectors = makeSelectors(3);
    const domOrder = Array.from(
      selectors.transcriptRoot.querySelectorAll(
        "[data-cgpt-transcript-bubble]",
      ),
    );
    const result = scanTranscript(selectors);
    expect(result.bubbles).toEqual(domOrder);
  });
});
