import type { PopupState } from '../shared/types.ts'

export interface TabStateStore {
  getTabPreference(tabId: number): boolean
  setTabPreference(tabId: number, enabled: boolean): void
}

export function createTabStateStore(
  initialEntries: Iterable<[number, boolean]> = [],
): TabStateStore {
  const preferences = new Map(initialEntries)

  return {
    getTabPreference(tabId) {
      return preferences.get(tabId) ?? false
    },
    setTabPreference(tabId, enabled) {
      preferences.set(tabId, enabled)
    },
  }
}

export function createPopupState(tabId: number | null, enabled: boolean): PopupState {
  if (typeof tabId !== 'number') {
    return {
      enabled,
      status: 'Unavailable',
    }
  }

  return {
    enabled,
    status: enabled ? 'On' : 'Off',
  }
}
