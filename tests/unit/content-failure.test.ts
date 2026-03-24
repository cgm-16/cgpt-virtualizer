// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  collectObservedSelectorAttributes,
  createSelectorFailureObserverManager,
} from "../../src/content/failure.ts";

describe("collectObservedSelectorAttributes", () => {
  it("collects selector-relevant attribute names from exact selectors", () => {
    expect(
      collectObservedSelectorAttributes([
        "[data-cgpt-scroll-container]",
        "main[data-cgpt-transcript-root].is-ready #transcript",
      ]),
    ).toEqual([
      "data-cgpt-scroll-container",
      "data-cgpt-transcript-root",
      "class",
      "id",
    ]);
  });
});

describe("createSelectorFailureObserverManager", () => {
  it("observes childList and selector-relevant attribute drift", () => {
    const observe = vi.fn();

    createSelectorFailureObserverManager({
      attributeFilter: ["data-cgpt-scroll-container", "class"],
      createMutationObserver() {
        return {
          disconnect() {},
          observe,
          takeRecords() {
            return [];
          },
        };
      },
      document,
      handleSelectorFailure() {},
      resolveSelectors() {
        return {
          bubbleSelector: "[data-cgpt-transcript-bubble]",
          scrollContainer: document.createElement("main"),
          streamingIndicatorSelector: "[data-cgpt-streaming-indicator]",
          transcriptRoot: document.createElement("section"),
        };
      },
    });

    expect(observe).toHaveBeenCalledWith(document.body, {
      attributeFilter: ["data-cgpt-scroll-container", "class"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  it("treats watched attribute-only drift as selector failure", () => {
    let callback: MutationCallback | null = null;
    const handleSelectorFailure = vi.fn();

    createSelectorFailureObserverManager({
      attributeFilter: ["data-cgpt-scroll-container"],
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
      document,
      handleSelectorFailure,
      resolveSelectors() {
        return null;
      },
    });

    if (callback === null) {
      throw new Error("selector failure observer callback was not registered");
    }

    callback(
      [
        {
          addedNodes: [] as unknown as NodeList,
          attributeName: "data-cgpt-scroll-container",
          attributeNamespace: null,
          nextSibling: null,
          oldValue: "",
          previousSibling: null,
          removedNodes: [] as unknown as NodeList,
          target: document.body,
          type: "attributes",
        } as MutationRecord,
      ],
      {} as MutationObserver,
    );

    expect(handleSelectorFailure).toHaveBeenCalledTimes(1);
  });
});
