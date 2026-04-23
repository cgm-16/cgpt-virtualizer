import {
  createTabEnabledMessage,
  DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE,
  GET_TAB_ENABLED_MESSAGE_TYPE,
  REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
  type ContentToWorkerMessage,
  type WorkerToContentMessage,
} from "../shared/messages.ts";
import type { TabStateStore } from "./tab-state.ts";

export interface ContentControllerDependencies {
  refreshTab(tabId: number): Promise<void>;
  tabStateStore: TabStateStore;
}

export async function handleContentMessage(
  message: ContentToWorkerMessage,
  senderTabId: number | null,
  dependencies: ContentControllerDependencies,
): Promise<WorkerToContentMessage | null> {
  if (message.type === REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE) {
    if (typeof senderTabId === "number") {
      await dependencies.tabStateStore.setTabAvailability(
        senderTabId,
        message.availability,
      );
    }

    return null;
  }

  if (message.type === GET_TAB_ENABLED_MESSAGE_TYPE) {
    const enabled =
      typeof senderTabId === "number" &&
      (await dependencies.tabStateStore.getTabPreference(senderTabId));
    return createTabEnabledMessage(enabled);
  }

  if (
    message.type !== DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE ||
    typeof senderTabId !== "number"
  ) {
    return null;
  }

  await dependencies.tabStateStore.setTabPreference(senderTabId, false);

  await dependencies.refreshTab(senderTabId);
  return null;
}
