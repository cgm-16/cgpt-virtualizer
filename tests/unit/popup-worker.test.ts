import { describe, expect, it } from "vitest";

import { handleContentMessage } from "../../src/background/content-controller.ts";
import {
  REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
  GET_POPUP_STATE_MESSAGE_TYPE,
  POPUP_STATE_MESSAGE_TYPE,
  SET_TAB_ENABLED_MESSAGE_TYPE,
  createGetTabEnabledMessage,
  createGetPopupStateMessage,
  createPopupStateMessage,
  createReportContentAvailabilityMessage,
  createSetTabEnabledMessage,
  isContentToWorkerMessage,
  isPopupToWorkerMessage,
} from "../../src/shared/messages.ts";
import { handlePopupMessage } from "../../src/background/popup-controller.ts";
import {
  createInMemoryStorage,
  createPopupState,
  createTabStateStore,
} from "../../src/background/tab-state.ts";
import { bootstrapContentEntry } from "../../src/content/startup.ts";
import { createPopupViewModel } from "../../src/popup-view.ts";

describe("popup-worker message contracts", () => {
  it("creates the popup state request message", () => {
    expect(createGetPopupStateMessage()).toEqual({
      type: GET_POPUP_STATE_MESSAGE_TYPE,
    });
  });

  it("creates the toggle update request message", () => {
    expect(createSetTabEnabledMessage(true)).toEqual({
      enabled: true,
      type: SET_TAB_ENABLED_MESSAGE_TYPE,
    });
  });

  it("creates popup state responses with the enabled flag and runtime status", () => {
    expect(createPopupStateMessage(true, "On")).toEqual({
      enabled: true,
      status: "On",
      type: POPUP_STATE_MESSAGE_TYPE,
    });
  });

  it("creates the content availability report message", () => {
    expect(createReportContentAvailabilityMessage("available")).toEqual({
      availability: "available",
      type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
    });
  });

  it("recognizes valid popup-to-worker messages", () => {
    expect(isPopupToWorkerMessage({ type: GET_POPUP_STATE_MESSAGE_TYPE })).toBe(
      true,
    );
    expect(
      isPopupToWorkerMessage({
        enabled: false,
        type: SET_TAB_ENABLED_MESSAGE_TYPE,
      }),
    ).toBe(true);
  });

  it("rejects malformed popup-to-worker messages", () => {
    expect(isPopupToWorkerMessage({ type: SET_TAB_ENABLED_MESSAGE_TYPE })).toBe(
      false,
    );
    expect(
      isPopupToWorkerMessage({
        enabled: "yes",
        type: SET_TAB_ENABLED_MESSAGE_TYPE,
      }),
    ).toBe(false);
    expect(isPopupToWorkerMessage({ type: "runtime/unknown" })).toBe(false);
    expect(isPopupToWorkerMessage(null)).toBe(false);
  });

  it("recognizes valid content-to-worker messages", () => {
    expect(
      isContentToWorkerMessage({
        availability: "idle",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        availability: "available",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        availability: "inactive",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        availability: "unavailable",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(true);
  });

  it("rejects malformed content-to-worker messages", () => {
    expect(
      isContentToWorkerMessage({
        availability: "broken",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(false);
    expect(
      isContentToWorkerMessage({
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(false);
  });
});

describe("tab state store", () => {
  it("defaults unseen tabs to off", async () => {
    const store = createTabStateStore(createInMemoryStorage());

    await expect(store.getTabPreference(7)).resolves.toBe(false);
    expect(
      createPopupState(7, false, "idle"),
    ).toEqual({
      enabled: false,
      status: "Off",
    });
  });

  it("stores preferences by tab id", async () => {
    const store = createTabStateStore(createInMemoryStorage());

    await store.setTabPreference(7, true);
    await store.setTabPreference(9, false);
    await store.setTabAvailability(7, "available");

    await expect(store.getTabPreference(7)).resolves.toBe(true);
    await expect(store.getTabPreference(9)).resolves.toBe(false);
    expect(
      createPopupState(7, true, "available"),
    ).toEqual({
      enabled: true,
      status: "On",
    });
  });

  it("marks missing active tabs as unavailable", () => {
    expect(createPopupState(null, false, "idle")).toEqual({
      enabled: false,
      status: "Unavailable",
    });
  });

  it("maps idle availability to off even when the tab preference is on", () => {
    expect(createPopupState(7, true, "idle")).toEqual({
      enabled: true,
      status: "Off",
    });
  });

  it("maps below-threshold transcripts to off even when the tab preference is on", () => {
    expect(createPopupState(7, true, "inactive")).toEqual({
      enabled: true,
      status: "Off",
    });
  });

  it("maps selector failures to unavailable", () => {
    expect(createPopupState(7, true, "unavailable")).toEqual({
      enabled: true,
      status: "Unavailable",
    });
  });
});

describe("popup controller", () => {
  it("returns off for an active tab with no stored preference", async () => {
    const store = createTabStateStore(createInMemoryStorage());

    await expect(
      handlePopupMessage(createGetPopupStateMessage(), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async () => {},
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: false,
      status: "Off",
      type: POPUP_STATE_MESSAGE_TYPE,
    });
  });

  it("stores the updated preference and refreshes the active tab", async () => {
    const refreshedTabIds: number[] = [];
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabAvailability(7, "available");

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(true), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId);
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: true,
      status: "On",
      type: POPUP_STATE_MESSAGE_TYPE,
    });

    await expect(store.getTabPreference(7)).resolves.toBe(true);
    expect(refreshedTabIds).toEqual([7]);
  });

  it("returns unavailable without mutating state when there is no active tab", async () => {
    const refreshedTabIds: number[] = [];
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabPreference(7, true);

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(false), {
        getActiveTabId: async () => null,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId);
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: false,
      status: "Unavailable",
      type: POPUP_STATE_MESSAGE_TYPE,
    });

    await expect(store.getTabPreference(7)).resolves.toBe(true);
    expect(refreshedTabIds).toEqual([]);
  });

  it("returns unavailable when the active transcript page reports selector failure", async () => {
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabPreference(7, true);
    await store.setTabAvailability(7, "unavailable");

    await expect(
      handlePopupMessage(createGetPopupStateMessage(), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async () => {},
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: true,
      status: "Unavailable",
      type: POPUP_STATE_MESSAGE_TYPE,
    });
  });
});

describe("toggle flow regression", () => {
  it("활성 탭 on/off 토글이 content startup gating까지 일관되게 반영된다", async () => {
    const store = createTabStateStore(createInMemoryStorage());
    const refreshedTabIds: number[] = [];

    await store.setTabAvailability(7, "available");

    const getCurrentTabVirtualizationEnabled = async () => {
      const response = await handleContentMessage(
        createGetTabEnabledMessage(),
        7,
        {
          refreshTab: async () => {},
          tabStateStore: store,
        },
      );

      if (response === null) {
        throw new Error("tab enabled 응답이 필요합니다.");
      }

      return response.enabled;
    };

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(true), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId);
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: true,
      status: "On",
      type: POPUP_STATE_MESSAGE_TYPE,
    });

    let reports: Array<
      ReturnType<typeof createReportContentAvailabilityMessage>
    > = [];
    let startCount = 0;

    await bootstrapContentEntry({
      getCurrentTabVirtualizationEnabled,
      reportAvailability(message) {
        reports.push(message);
      },
      startContentRuntime() {
        startCount += 1;
      },
    });

    expect(startCount).toBe(1);
    expect(reports).toEqual([]);

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(false), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId);
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: false,
      status: "Off",
      type: POPUP_STATE_MESSAGE_TYPE,
    });

    reports = [];
    startCount = 0;

    await bootstrapContentEntry({
      getCurrentTabVirtualizationEnabled,
      reportAvailability(message) {
        reports.push(message);
      },
      startContentRuntime() {
        startCount += 1;
      },
    });

    expect(startCount).toBe(0);
    expect(reports).toEqual([createReportContentAvailabilityMessage("idle")]);
    expect(refreshedTabIds).toEqual([7, 7]);
  });
});

describe("popup view model", () => {
  it("shows On with an enabled active toggle", () => {
    expect(
      createPopupViewModel({
        enabled: true,
        status: "On",
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: true,
      disabled: false,
      statusLine: "On",
    });
  });

  it("shows Off with an enabled inactive toggle", () => {
    expect(
      createPopupViewModel({
        enabled: false,
        status: "Off",
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: false,
      disabled: false,
      statusLine: "Off",
    });
  });

  it("shows Unavailable with a disabled toggle", () => {
    expect(
      createPopupViewModel({
        enabled: true,
        status: "Unavailable",
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: true,
      disabled: true,
      statusLine: "Unavailable",
    });
  });
});
