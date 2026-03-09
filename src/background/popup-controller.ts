import {
  SET_TAB_ENABLED_MESSAGE_TYPE,
  createPopupStateMessage,
  type PopupToWorkerMessage,
  type WorkerToPopupMessage,
} from "../shared/messages.ts";
import { createPopupState, type TabStateStore } from "./tab-state.ts";

export interface PopupControllerDependencies {
  getActiveTabId(): Promise<number | null>;
  refreshActiveTab(tabId: number): Promise<void>;
  tabStateStore: TabStateStore;
}

export async function handlePopupMessage(
  message: PopupToWorkerMessage,
  dependencies: PopupControllerDependencies,
): Promise<WorkerToPopupMessage> {
  const activeTabId = await dependencies.getActiveTabId();

  if (message.type === SET_TAB_ENABLED_MESSAGE_TYPE && activeTabId !== null) {
    dependencies.tabStateStore.setTabPreference(activeTabId, message.enabled);
    await dependencies.refreshActiveTab(activeTabId);
  }

  const enabled =
    activeTabId === null
      ? false
      : dependencies.tabStateStore.getTabPreference(activeTabId);
  const availability =
    activeTabId === null
      ? "idle"
      : dependencies.tabStateStore.getTabAvailability(activeTabId);
  const popupState = createPopupState(activeTabId, enabled, availability);

  return createPopupStateMessage(popupState.enabled, popupState.status);
}
