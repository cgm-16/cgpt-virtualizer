import type { ContentAvailability, PopupState } from "../shared/types.ts";

export interface TabStateStore {
  getTabPreference(tabId: number): boolean;
  getTabAvailability(tabId: number): ContentAvailability;
  setTabAvailability(tabId: number, availability: ContentAvailability): void;
  setTabPreference(tabId: number, enabled: boolean): void;
}

export function createTabStateStore(
  initialEntries: Iterable<[number, boolean]> = [],
  initialAvailabilityEntries: Iterable<[number, ContentAvailability]> = [],
): TabStateStore {
  const preferences = new Map(initialEntries);
  const availabilities = new Map(initialAvailabilityEntries);

  return {
    getTabPreference(tabId) {
      return preferences.get(tabId) ?? false;
    },
    getTabAvailability(tabId) {
      return availabilities.get(tabId) ?? "idle";
    },
    setTabAvailability(tabId, availability) {
      availabilities.set(tabId, availability);
    },
    setTabPreference(tabId, enabled) {
      preferences.set(tabId, enabled);
    },
  };
}

export function createPopupState(
  tabId: number | null,
  enabled: boolean,
  availability: ContentAvailability,
): PopupState {
  if (typeof tabId !== "number") {
    return {
      enabled,
      status: "Unavailable",
    };
  }

  if (availability === "unavailable") {
    return {
      enabled,
      status: "Unavailable",
    };
  }

  if (!enabled || availability === "idle" || availability === "inactive") {
    return {
      enabled,
      status: "Off",
    };
  }

  return {
    enabled,
    status: "On",
  };
}
