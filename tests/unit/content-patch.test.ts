// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  computeSpacerHeights,
  patchMountedRange,
} from "../../src/content/patch.ts";
import type {
  BubbleRecord,
  TranscriptSessionState,
} from "../../src/content/state.ts";

describe("computeSpacerHeights", () => {
  it("returns top and bottom heights for a middle mounted range", () => {
    expect(computeSpacerHeights([10, 30, 60, 100], 1, 2, 4)).toEqual({
      bottom: 40,
      top: 10,
    });
  });

  it("returns zero spacer heights when the full range is mounted", () => {
    expect(computeSpacerHeights([10, 30, 60], 0, 2, 3)).toEqual({
      bottom: 0,
      top: 0,
    });
  });
});

describe("patchMountedRange", () => {
  it("inserts spacers and mounts only the requested inclusive range", () => {
    const fixture = makeSessionFixture([10, 20, 30, 40]);

    patchMountedRange(fixture.sessionState, 1, 2);

    const rootChildren = Array.from(fixture.transcriptRoot.children);

    expect(rootChildren).toEqual([
      fixture.transcriptRoot.querySelector("[data-cgpt-top-spacer]"),
      fixture.bubbles[1],
      fixture.bubbles[2],
      fixture.transcriptRoot.querySelector("[data-cgpt-bottom-spacer]"),
    ]);
    expect(fixture.bubbles[0].isConnected).toBe(false);
    expect(fixture.bubbles[3].isConnected).toBe(false);
    expect(
      fixture.sessionState.records.map((record) => record.mounted),
    ).toEqual([false, true, true, false]);
  });

  it("reuses the original bubble nodes when the mounted range changes", () => {
    const fixture = makeSessionFixture([10, 20, 30, 40]);

    patchMountedRange(fixture.sessionState, 0, 1);
    patchMountedRange(fixture.sessionState, 2, 3);

    const rootChildren = Array.from(fixture.transcriptRoot.children);

    expect(rootChildren[1]).toBe(fixture.bubbles[2]);
    expect(rootChildren[2]).toBe(fixture.bubbles[3]);
    expect(fixture.sessionState.records[2].node).toBe(fixture.bubbles[2]);
    expect(fixture.sessionState.records[3].node).toBe(fixture.bubbles[3]);
    expect(
      fixture.sessionState.records.map((record) => record.mounted),
    ).toEqual([false, false, true, true]);
  });
});

function makeSessionFixture(heights: number[]): {
  bubbles: HTMLElement[];
  sessionState: TranscriptSessionState;
  transcriptRoot: HTMLElement;
} {
  const transcriptRoot = document.createElement("section");
  const scrollContainer = document.createElement("main");
  const bubbles = heights.map((height, index) => {
    const bubble = document.createElement("article");
    bubble.textContent = `Bubble ${index}`;
    transcriptRoot.append(bubble);
    return bubble;
  });
  const records = bubbles.map(
    (bubble, index): BubbleRecord => ({
      index,
      measuredHeight: heights[index],
      mounted: false,
      node: bubble,
      pinned: false,
    }),
  );

  return {
    bubbles,
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      isStreaming: false,
      mountedRange: null,
      pendingScrollCorrection: 0,
      prefixSums: [10, 30, 60, 100].slice(0, heights.length),
      records,
      scrollContainer,
      transcriptRoot,
    },
    transcriptRoot,
  };
}
