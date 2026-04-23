import { describe, expect, it, vi } from "vitest";

import { handleContentMessage } from "../../src/background/content-controller.ts";
import {
  createInMemoryStorage,
  createTabStateStore,
} from "../../src/background/tab-state.ts";
import {
  DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE,
  GET_TAB_ENABLED_MESSAGE_TYPE,
  REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
  TAB_ENABLED_MESSAGE_TYPE,
  createDisableTabVirtualizationMessage,
  createGetTabEnabledMessage,
  createReportContentAvailabilityMessage,
  createTabEnabledMessage,
  isContentToWorkerMessage,
  isWorkerToContentMessage,
} from "../../src/shared/messages.ts";

describe("content-worker message contracts", () => {
  it("creates content control request messages", () => {
    expect(createGetTabEnabledMessage()).toEqual({
      type: GET_TAB_ENABLED_MESSAGE_TYPE,
    });
    expect(createDisableTabVirtualizationMessage()).toEqual({
      type: DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE,
    });
    expect(createTabEnabledMessage(true)).toEqual({
      enabled: true,
      type: TAB_ENABLED_MESSAGE_TYPE,
    });
  });

  it("recognizes valid content-to-worker messages", () => {
    expect(
      isContentToWorkerMessage({
        availability: "available",
        type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({ type: GET_TAB_ENABLED_MESSAGE_TYPE }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        type: DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE,
      }),
    ).toBe(true);
  });

  it("recognizes valid worker-to-content messages", () => {
    expect(
      isWorkerToContentMessage({
        enabled: false,
        type: TAB_ENABLED_MESSAGE_TYPE,
      }),
    ).toBe(true);
  });
});

describe("handleContentMessage", () => {
  it("content availability 보고를 tab state에 반영한다", async () => {
    const store = createTabStateStore(createInMemoryStorage());

    await expect(
      handleContentMessage(
        createReportContentAvailabilityMessage("available"),
        7,
        {
          refreshTab: async () => {},
          tabStateStore: store,
        },
      ),
    ).resolves.toBeNull();

    await expect(store.getTabAvailability(7)).resolves.toBe("available");
  });

  it("sender tab의 enabled 상태를 응답한다", async () => {
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabPreference(7, true);

    await expect(
      handleContentMessage(createGetTabEnabledMessage(), 7, {
        refreshTab: async () => {},
        tabStateStore: store,
      }),
    ).resolves.toEqual(createTabEnabledMessage(true));
  });

  it("memory guard 요청이 오면 sender tab을 끄고 refresh한다", async () => {
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabPreference(7, true);
    const refreshTab = vi.fn(async () => {});

    await expect(
      handleContentMessage(createDisableTabVirtualizationMessage(), 7, {
        refreshTab,
        tabStateStore: store,
      }),
    ).resolves.toBeNull();

    await expect(store.getTabPreference(7)).resolves.toBe(false);
    expect(refreshTab).toHaveBeenCalledWith(7);
  });

  it("sender tab id가 없으면 disable 요청을 무시한다", async () => {
    const store = createTabStateStore(createInMemoryStorage());
    await store.setTabPreference(7, true);
    const refreshTab = vi.fn(async () => {});

    await expect(
      handleContentMessage(createDisableTabVirtualizationMessage(), null, {
        refreshTab,
        tabStateStore: store,
      }),
    ).resolves.toBeNull();

    await expect(store.getTabPreference(7)).resolves.toBe(true);
    expect(refreshTab).not.toHaveBeenCalled();
  });
});
