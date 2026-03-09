export const RUNTIME_STATUS_VALUES = ["On", "Off", "Unavailable"] as const;
export const CONTENT_AVAILABILITY_VALUES = [
  "idle",
  "inactive",
  "available",
  "unavailable",
] as const;

export type RuntimeStatus = (typeof RUNTIME_STATUS_VALUES)[number];
export type ContentAvailability = (typeof CONTENT_AVAILABILITY_VALUES)[number];
export type PopupStatus = RuntimeStatus;
export type RuntimeAvailability = Extract<RuntimeStatus, "On" | "Unavailable">;
export type TranscriptSessionId = string;

export interface PopupState {
  enabled: boolean;
  status: PopupStatus;
}

export interface TranscriptPathMatch {
  conversationId: TranscriptSessionId;
  pathname: string;
}

export function createRuntimeStatus(value: RuntimeStatus): RuntimeStatus {
  return value;
}
