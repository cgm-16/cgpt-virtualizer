import {
  isContentToWorkerMessage,
  isPopupToWorkerMessage,
} from "./shared/messages.ts";
import { handleContentMessage } from "./background/content-controller.ts";
import { handlePopupMessage } from "./background/popup-controller.ts";
import {
  createTabStateStore,
  type StorageBackend,
} from "./background/tab-state.ts";

const sessionStorage: StorageBackend = {
  async get(key) {
    const result = await chrome.storage.session.get(key);
    return result[key];
  },
  async set(key, value) {
    await chrome.storage.session.set({ [key]: value });
  },
};

const tabStateStore = createTabStateStore(sessionStorage);

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (isContentToWorkerMessage(message)) {
      void handleContentMessage(message, sender.tab?.id ?? null, {
        refreshTab: refreshActiveTab,
        tabStateStore,
      })
        .then((response) => {
          sendResponse(response);
        })
        .catch(() => {
          sendResponse(null);
        });

      return true;
    }

    if (!isPopupToWorkerMessage(message)) {
      return false;
    }

    void handlePopupMessage(message, {
      getActiveTabId,
      refreshActiveTab,
      tabStateStore,
    }).then(sendResponse);

    return true;
  },
);

function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      resolve(typeof activeTabId === "number" ? activeTabId : null);
    });
  });
}

function refreshActiveTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, () => {
      resolve();
    });
  });
}
