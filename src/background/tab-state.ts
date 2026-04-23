import type { ContentAvailability, PopupState } from "../shared/types.ts";

export interface TabStateStore {
  getTabPreference(tabId: number): Promise<boolean>;
  getTabAvailability(tabId: number): Promise<ContentAvailability>;
  setTabAvailability(
    tabId: number,
    availability: ContentAvailability,
  ): Promise<void>;
  setTabPreference(tabId: number, enabled: boolean): Promise<void>;
}

export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export function createInMemoryStorage(): StorageBackend {
  const store = new Map<string, unknown>();
  return {
    get(key) {
      return Promise.resolve(store.get(key));
    },
    set(key, value) {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

export function createTabStateStore(storage: StorageBackend): TabStateStore {
  return {
    async getTabPreference(tabId) {
      const value = await storage.get(`tab-pref:${tabId}`);
      return typeof value === "boolean" ? value : false;
    },
    async getTabAvailability(tabId) {
      const value = await storage.get(`tab-avail:${tabId}`);
      return isContentAvailability(value) ? value : "idle";
    },
    async setTabAvailability(tabId, availability) {
      await storage.set(`tab-avail:${tabId}`, availability);
    },
    async setTabPreference(tabId, enabled) {
      await storage.set(`tab-pref:${tabId}`, enabled);
    },
  };
}

function isContentAvailability(value: unknown): value is ContentAvailability {
  return (
    value === "idle" ||
    value === "available" ||
    value === "inactive" ||
    value === "unavailable"
  );
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
