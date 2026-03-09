// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isNearBottom, snapToBottom } from "../../src/content/bottom-follow.ts";
import { NEAR_BOTTOM_THRESHOLD_PX } from "../../src/shared/constants.ts";

describe("isNearBottom", () => {
  it("treats a viewport within the threshold as near bottom", () => {
    const scrollContainer = makeScrollContainer({
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 600,
    });

    expect(isNearBottom(scrollContainer, NEAR_BOTTOM_THRESHOLD_PX)).toBe(true);
  });

  it("rejects a viewport that sits beyond the threshold", () => {
    const scrollContainer = makeScrollContainer({
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 599,
    });

    expect(isNearBottom(scrollContainer, NEAR_BOTTOM_THRESHOLD_PX)).toBe(false);
  });
});

describe("snapToBottom", () => {
  it("moves the viewport to the exact transcript bottom", () => {
    const scrollContainer = makeScrollContainer({
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 0,
    });

    snapToBottom(scrollContainer);

    expect(scrollContainer.scrollTop).toBe(800);
  });
});

function makeScrollContainer(options: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}): HTMLElement {
  const scrollContainer = document.createElement("main");

  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: options.clientHeight,
  });
  Object.defineProperty(scrollContainer, "scrollHeight", {
    configurable: true,
    value: options.scrollHeight,
  });
  scrollContainer.scrollTop = options.scrollTop;

  return scrollContainer;
}
