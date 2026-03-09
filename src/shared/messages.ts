import type { ContentAvailability, PopupState } from "./types.ts";

export const GET_POPUP_STATE_MESSAGE_TYPE = "runtime/get-popup-state" as const;
export const SET_TAB_ENABLED_MESSAGE_TYPE = "runtime/set-tab-enabled" as const;
export const POPUP_STATE_MESSAGE_TYPE = "runtime/popup-state" as const;
export const REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE =
  "runtime/report-content-availability" as const;
export const GET_TAB_ENABLED_MESSAGE_TYPE = "runtime/get-tab-enabled" as const;
export const TAB_ENABLED_MESSAGE_TYPE = "runtime/tab-enabled" as const;
export const DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE =
  "runtime/disable-tab-virtualization" as const;

export interface GetPopupStateMessage {
  type: typeof GET_POPUP_STATE_MESSAGE_TYPE;
}

export interface SetTabEnabledMessage {
  enabled: boolean;
  type: typeof SET_TAB_ENABLED_MESSAGE_TYPE;
}

export interface PopupStateMessage extends PopupState {
  type: typeof POPUP_STATE_MESSAGE_TYPE;
}

export interface ReportContentAvailabilityMessage {
  availability: ContentAvailability;
  type: typeof REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE;
}

export interface GetTabEnabledMessage {
  type: typeof GET_TAB_ENABLED_MESSAGE_TYPE;
}

export interface TabEnabledMessage {
  enabled: boolean;
  type: typeof TAB_ENABLED_MESSAGE_TYPE;
}

export interface DisableTabVirtualizationMessage {
  type: typeof DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE;
}

export type PopupToWorkerMessage = GetPopupStateMessage | SetTabEnabledMessage;
export type ContentToWorkerMessage =
  | DisableTabVirtualizationMessage
  | GetTabEnabledMessage
  | ReportContentAvailabilityMessage;
export type WorkerToPopupMessage = PopupStateMessage;
export type WorkerToContentMessage = TabEnabledMessage;

export function createGetPopupStateMessage(): GetPopupStateMessage {
  return {
    type: GET_POPUP_STATE_MESSAGE_TYPE,
  };
}

export function createSetTabEnabledMessage(
  enabled: boolean,
): SetTabEnabledMessage {
  return {
    enabled,
    type: SET_TAB_ENABLED_MESSAGE_TYPE,
  };
}

export function createPopupStateMessage(
  enabled: boolean,
  status: PopupState["status"],
): PopupStateMessage {
  return {
    enabled,
    status,
    type: POPUP_STATE_MESSAGE_TYPE,
  };
}

export function createReportContentAvailabilityMessage(
  availability: ContentAvailability,
): ReportContentAvailabilityMessage {
  return {
    availability,
    type: REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE,
  };
}

export function createGetTabEnabledMessage(): GetTabEnabledMessage {
  return {
    type: GET_TAB_ENABLED_MESSAGE_TYPE,
  };
}

export function createTabEnabledMessage(enabled: boolean): TabEnabledMessage {
  return {
    enabled,
    type: TAB_ENABLED_MESSAGE_TYPE,
  };
}

export function createDisableTabVirtualizationMessage(): DisableTabVirtualizationMessage {
  return {
    type: DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE,
  };
}

export function isPopupToWorkerMessage(
  value: unknown,
): value is PopupToWorkerMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value)) {
    return false;
  }

  if (value.type === GET_POPUP_STATE_MESSAGE_TYPE) {
    return true;
  }

  if (value.type !== SET_TAB_ENABLED_MESSAGE_TYPE || !("enabled" in value)) {
    return false;
  }

  return typeof value.enabled === "boolean";
}

export function isContentToWorkerMessage(
  value: unknown,
): value is ContentToWorkerMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value)) {
    return false;
  }

  if (value.type === GET_TAB_ENABLED_MESSAGE_TYPE) {
    return true;
  }

  if (value.type === DISABLE_TAB_VIRTUALIZATION_MESSAGE_TYPE) {
    return true;
  }

  if (
    value.type !== REPORT_CONTENT_AVAILABILITY_MESSAGE_TYPE ||
    !("availability" in value)
  ) {
    return false;
  }

  return (
    value.availability === "idle" ||
    value.availability === "inactive" ||
    value.availability === "available" ||
    value.availability === "unavailable"
  );
}

export function isWorkerToPopupMessage(
  value: unknown,
): value is WorkerToPopupMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value) || value.type !== POPUP_STATE_MESSAGE_TYPE) {
    return false;
  }

  if (!("enabled" in value) || typeof value.enabled !== "boolean") {
    return false;
  }

  if (!("status" in value)) {
    return false;
  }

  return (
    value.status === "On" ||
    value.status === "Off" ||
    value.status === "Unavailable"
  );
}

export function isWorkerToContentMessage(
  value: unknown,
): value is WorkerToContentMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value) || value.type !== TAB_ENABLED_MESSAGE_TYPE) {
    return false;
  }

  return "enabled" in value && typeof value.enabled === "boolean";
}
