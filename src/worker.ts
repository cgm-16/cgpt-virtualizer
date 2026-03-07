import {
  isPopupToWorkerMessage,
} from './shared/messages.ts'
import { handlePopupMessage } from './background/popup-controller.ts'
import { createTabStateStore } from './background/tab-state.ts'

const tabStateStore = createTabStateStore()

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
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
