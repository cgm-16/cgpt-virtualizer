// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  findRangeByScrollPosition,
  shouldSchedulePatch,
} from "../../src/content/range.ts";
import type { MountedRange } from "../../src/content/state.ts";

describe("findRangeByScrollPosition", () => {
  it("returns null when there are no measured bubbles", () => {
    expect(findRangeByScrollPosition([], 0, 200, 200, 200)).toBeNull();
  });

  it("uses binary search to resolve the initial overscanned range near the top", () => {
    expect(
      findRangeByScrollPosition([100, 200, 300, 400, 500], 0, 100, 100, 100),
    ).toEqual({
      start: 0,
      end: 1,
    });
  });

  it("clamps the overscanned range near the end of the transcript", () => {
    expect(
      findRangeByScrollPosition([100, 200, 300, 400, 500], 400, 100, 100, 100),
    ).toEqual({
      start: 3,
      end: 4,
    });
  });
});

describe("shouldSchedulePatch", () => {
  it("schedules when there is no current range yet", () => {
    expect(shouldSchedulePatch(null, { start: 0, end: 3 })).toBe(true);
  });

  it("does not schedule when the next range matches the current range", () => {
    expect(shouldSchedulePatch(makeRange(0, 6), makeRange(0, 6))).toBe(false);
  });

  it("schedules when the next range changes either boundary", () => {
    expect(shouldSchedulePatch(makeRange(0, 6), makeRange(2, 7))).toBe(true);
  });
});

function makeRange(start: number, end: number): MountedRange {
  return { start, end };
}
