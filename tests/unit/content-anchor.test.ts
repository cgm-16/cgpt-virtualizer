// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  accumulateScrollCorrection,
  applyScrollCorrection,
  captureAnchorSnapshot,
  computeAnchorOffset,
  resolveAnchorCorrection,
  selectAnchorBubble,
} from "../../src/content/anchor.ts";
import type { BubbleRecord } from "../../src/content/state.ts";

describe("selectAnchorBubble", () => {
  it("returns the first mounted bubble intersecting the viewport", () => {
    const records = [
      makeBubbleRecord(0, { top: -80, bottom: -20 }),
      makeBubbleRecord(1, { top: -10, bottom: 40 }),
      makeBubbleRecord(2, { top: 20, bottom: 80 }),
    ];

    expect(selectAnchorBubble(records, { top: 0, bottom: 60 })?.index).toBe(1);
  });

  it("ignores unmounted bubbles and returns null when nothing intersects", () => {
    const records = [
      makeBubbleRecord(0, { top: 0, bottom: 40 }, false),
      makeBubbleRecord(1, { top: 80, bottom: 120 }),
    ];

    expect(selectAnchorBubble(records, { top: 0, bottom: 60 })).toBeNull();
    expect(captureAnchorSnapshot(records, { top: 0, bottom: 60 })).toBeNull();
  });
});

describe("computeAnchorOffset", () => {
  it("measures the distance from the viewport top to the anchor bubble", () => {
    const record = makeBubbleRecord(0, { top: 124, bottom: 184 });

    expect(computeAnchorOffset(record.node, 100)).toBe(24);
  });
});

describe("accumulateScrollCorrection", () => {
  it("adds height deltas only for bubbles above the anchor", () => {
    const anchor = captureAnchorSnapshot(
      [
        makeBubbleRecord(0, { top: -20, bottom: 20 }),
        makeBubbleRecord(1, { top: 20, bottom: 60 }),
        makeBubbleRecord(2, { top: 60, bottom: 100 }),
      ],
      { top: 0, bottom: 80 },
    );

    expect(anchor?.index).toBe(0);
    expect(accumulateScrollCorrection(5, anchor, 0, 12)).toBe(5);
    expect(accumulateScrollCorrection(5, anchor, 1, 12)).toBe(5);

    const laterAnchor = {
      index: 2,
      node: document.createElement("article"),
      offset: 10,
    };

    expect(accumulateScrollCorrection(5, laterAnchor, 1, 12)).toBe(17);
  });
});

describe("resolveAnchorCorrection", () => {
  it("returns zero when there is no valid anchor snapshot", () => {
    expect(resolveAnchorCorrection(null, 100)).toBe(0);

    const disconnectedAnchor = {
      index: 0,
      node: document.createElement("article"),
      offset: 12,
    };

    expect(resolveAnchorCorrection(disconnectedAnchor, 100)).toBe(0);
  });

  it("returns the post-patch offset drift for a connected anchor node", () => {
    const record = makeBubbleRecord(0, { top: 145, bottom: 205 });
    document.body.replaceChildren(record.node);

    expect(
      resolveAnchorCorrection(
        {
          index: 0,
          node: record.node,
          offset: 20,
        },
        100,
      ),
    ).toBe(25);
  });
});

describe("applyScrollCorrection", () => {
  it("adds the correction to scrollTop and ignores zero deltas", () => {
    const scrollContainer = document.createElement("main");
    scrollContainer.scrollTop = 120;

    applyScrollCorrection(scrollContainer, 25);
    applyScrollCorrection(scrollContainer, 0);

    expect(scrollContainer.scrollTop).toBe(145);
  });
});

function makeBubbleRecord(
  index: number,
  rect: { bottom: number; top: number },
  mounted = true,
): BubbleRecord {
  const node = document.createElement("article");
  node.getBoundingClientRect = () => ({ ...rect }) as DOMRect;

  return {
    index,
    measuredHeight: rect.bottom - rect.top,
    mounted,
    node,
    pinned: false,
  };
}
