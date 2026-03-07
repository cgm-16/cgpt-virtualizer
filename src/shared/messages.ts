import type { RuntimeStatus, TranscriptSessionId } from './types.ts'

export const GET_TAB_STATUS_MESSAGE_TYPE = 'runtime/get-tab-status' as const
export const TAB_STATUS_MESSAGE_TYPE = 'runtime/tab-status' as const

export interface GetTabStatusMessage {
  type: typeof GET_TAB_STATUS_MESSAGE_TYPE
}

export interface TabStatusMessage {
  conversationId: TranscriptSessionId | null
  status: RuntimeStatus
  type: typeof TAB_STATUS_MESSAGE_TYPE
}

export type PopupToWorkerMessage = GetTabStatusMessage
export type WorkerToPopupMessage = TabStatusMessage

export function createGetTabStatusMessage(): GetTabStatusMessage {
  return {
    type: GET_TAB_STATUS_MESSAGE_TYPE,
  }
}

export function createTabStatusMessage(
  status: RuntimeStatus,
  conversationId: TranscriptSessionId | null = null,
): TabStatusMessage {
  return {
    conversationId,
    status,
    type: TAB_STATUS_MESSAGE_TYPE,
  }
}

export function isPopupToWorkerMessage(value: unknown): value is PopupToWorkerMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return 'type' in value && value.type === GET_TAB_STATUS_MESSAGE_TYPE
}
