import {
  isContentToWorkerMessage,
  isPopupToWorkerMessage,
} from './shared/messages.ts'
import { handleContentMessage } from './background/content-controller.ts'
import { handlePopupMessage } from './background/popup-controller.ts'
import { createTabStateStore } from './background/tab-state.ts'

const tabStateStore = createTabStateStore()

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isContentToWorkerMessage(message)) {
    handleContentMessage(message, sender.tab?.id ?? null, tabStateStore)
    return false
  }

  if (!isPopupToWorkerMessage(message)) {
    return false
  }

  void handlePopupMessage(message, {
    getActiveTabId,
    refreshActiveTab,
    tabStateStore,
  }).then(sendResponse)

  return true
})

function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id
      resolve(typeof activeTabId === 'number' ? activeTabId : null)
    })
  })
}

function refreshActiveTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, () => {
      resolve()
    })
  })
}
