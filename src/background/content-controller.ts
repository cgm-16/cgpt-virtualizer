import type { ContentToWorkerMessage } from '../shared/messages.ts'
import type { TabStateStore } from './tab-state.ts'

export function handleContentMessage(
  message: ContentToWorkerMessage,
  senderTabId: number | null,
  tabStateStore: TabStateStore,
): void {
  if (typeof senderTabId !== 'number') {
    return
  }

  tabStateStore.setTabAvailability(senderTabId, message.availability)
}
