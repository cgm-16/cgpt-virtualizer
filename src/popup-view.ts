import type { WorkerToPopupMessage } from './shared/messages.ts'

export interface PopupViewModel {
  checked: boolean
  disabled: boolean
  statusLine: WorkerToPopupMessage['status']
}

export function createPopupViewModel(message: WorkerToPopupMessage): PopupViewModel {
  return {
    checked: message.enabled,
    disabled: message.status === 'Unavailable',
    statusLine: message.status,
  }
}
