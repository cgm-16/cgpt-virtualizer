import type { ContentAvailability, PopupState } from './types.ts'

export const GET_POPUP_STATE_MESSAGE_TYPE = 'runtime/get-popup-state' as const
export const SET_TAB_ENABLED_MESSAGE_TYPE = 'runtime/set-tab-enabled' as const
export const POPUP_STATE_MESSAGE_TYPE = 'runtime/popup-state' as const
export const REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE =
  'runtime/report-content-availability' as const

export interface GetPopupStateMessage {
  type: typeof GET_POPUP_STATE_MESSAGE_TYPE
}

export interface SetTabEnabledMessage {
  enabled: boolean
  type: typeof SET_TAB_ENABLED_MESSAGE_TYPE
}

export interface PopupStateMessage extends PopupState {
  type: typeof POPUP_STATE_MESSAGE_TYPE
}

export interface ReportContentAvailabilityMessage {
  availability: ContentAvailability
  type: typeof REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE
}

export type PopupToWorkerMessage = GetPopupStateMessage | SetTabEnabledMessage
export type ContentToWorkerMessage = ReportContentAvailabilityMessage
export type WorkerToPopupMessage = PopupStateMessage

export function createGetPopupStateMessage(): GetPopupStateMessage {
  return {
    type: GET_POPUP_STATE_MESSAGE_TYPE,
  }
}

export function createSetTabEnabledMessage(enabled: boolean): SetTabEnabledMessage {
  return {
    enabled,
    type: SET_TAB_ENABLED_MESSAGE_TYPE,
  }
}

export function createPopupStateMessage(
  enabled: boolean,
  status: PopupState['status'],
): PopupStateMessage {
  return {
    enabled,
    status,
    type: POPUP_STATE_MESSAGE_TYPE,
  }
}

export function createReportContentAvailabilityMessage(
  availability: ContentAvailability,
): ReportContentAvailabilityMessage {
  return {
    availability,
    type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
  }
}

export function isPopupToWorkerMessage(value: unknown): value is PopupToWorkerMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (!('type' in value)) {
    return false
  }

  if (value.type === GET_POPUP_STATE_MESSAGE_TYPE) {
    return true
  }

  if (value.type !== SET_TAB_ENABLED_MESSAGE_TYPE || !('enabled' in value)) {
    return false
  }

  return typeof value.enabled === 'boolean'
}

export function isContentToWorkerMessage(value: unknown): value is ContentToWorkerMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (!('type' in value) || value.type !== REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE) {
    return false
  }

  if (!('availability' in value)) {
    return false
  }

  return (
    value.availability === 'idle' ||
    value.availability === 'inactive' ||
    value.availability === 'available' ||
    value.availability === 'unavailable'
  )
}

export function isWorkerToPopupMessage(value: unknown): value is WorkerToPopupMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (!('type' in value) || value.type !== POPUP_STATE_MESSAGE_TYPE) {
    return false
  }

  if (!('enabled' in value) || typeof value.enabled !== 'boolean') {
    return false
  }

  if (!('status' in value)) {
    return false
  }

  return value.status === 'On' || value.status === 'Off' || value.status === 'Unavailable'
}
