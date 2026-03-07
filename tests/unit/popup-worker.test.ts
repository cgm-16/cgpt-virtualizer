import { describe, expect, it } from 'vitest'

import {
  GET_POPUP_STATE_MESSAGE_TYPE,
  POPUP_STATE_MESSAGE_TYPE,
  SET_TAB_ENABLED_MESSAGE_TYPE,
  createGetPopupStateMessage,
  createPopupStateMessage,
  createSetTabEnabledMessage,
  isPopupToWorkerMessage,
} from '../../src/shared/messages.ts'
import { handlePopupMessage } from '../../src/background/popup-controller.ts'
import { createPopupState, createTabStateStore } from '../../src/background/tab-state.ts'
import { createPopupViewModel } from '../../src/popup-view.ts'

describe('popup-worker message contracts', () => {
  it('creates the popup state request message', () => {
    expect(createGetPopupStateMessage()).toEqual({
      type: GET_POPUP_STATE_MESSAGE_TYPE,
    })
  })

  it('creates the toggle update request message', () => {
    expect(createSetTabEnabledMessage(true)).toEqual({
      enabled: true,
      type: SET_TAB_ENABLED_MESSAGE_TYPE,
    })
  })

  it('creates popup state responses with the enabled flag and runtime status', () => {
    expect(createPopupStateMessage(true, 'On')).toEqual({
      enabled: true,
      status: 'On',
      type: POPUP_STATE_MESSAGE_TYPE,
    })
  })

  it('recognizes valid popup-to-worker messages', () => {
    expect(isPopupToWorkerMessage({ type: GET_POPUP_STATE_MESSAGE_TYPE })).toBe(true)
    expect(
      isPopupToWorkerMessage({
        enabled: false,
        type: SET_TAB_ENABLED_MESSAGE_TYPE,
      }),
    ).toBe(true)
  })

  it('rejects malformed popup-to-worker messages', () => {
    expect(isPopupToWorkerMessage({ type: SET_TAB_ENABLED_MESSAGE_TYPE })).toBe(false)
    expect(
      isPopupToWorkerMessage({
        enabled: 'yes',
        type: SET_TAB_ENABLED_MESSAGE_TYPE,
      }),
    ).toBe(false)
    expect(isPopupToWorkerMessage({ type: 'runtime/unknown' })).toBe(false)
    expect(isPopupToWorkerMessage(null)).toBe(false)
  })
})

describe('tab state store', () => {
  it('defaults unseen tabs to off', () => {
    const store = createTabStateStore()

    expect(store.getTabPreference(7)).toBe(false)
    expect(createPopupState(7, store.getTabPreference(7))).toEqual({
      enabled: false,
      status: 'Off',
    })
  })

  it('stores preferences by tab id', () => {
    const store = createTabStateStore()

    store.setTabPreference(7, true)
    store.setTabPreference(9, false)

    expect(store.getTabPreference(7)).toBe(true)
    expect(store.getTabPreference(9)).toBe(false)
    expect(createPopupState(7, store.getTabPreference(7))).toEqual({
      enabled: true,
      status: 'On',
    })
  })

  it('marks missing active tabs as unavailable', () => {
    expect(createPopupState(null, false)).toEqual({
      enabled: false,
      status: 'Unavailable',
    })
  })
})

describe('popup controller', () => {
  it('returns off for an active tab with no stored preference', async () => {
    const store = createTabStateStore()

    await expect(
      handlePopupMessage(createGetPopupStateMessage(), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async () => {},
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: false,
      status: 'Off',
      type: POPUP_STATE_MESSAGE_TYPE,
    })
  })

  it('stores the updated preference and refreshes the active tab', async () => {
    const refreshedTabIds: number[] = []
    const store = createTabStateStore()

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(true), {
        getActiveTabId: async () => 7,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId)
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: true,
      status: 'On',
      type: POPUP_STATE_MESSAGE_TYPE,
    })

    expect(store.getTabPreference(7)).toBe(true)
    expect(refreshedTabIds).toEqual([7])
  })

  it('returns unavailable without mutating state when there is no active tab', async () => {
    const refreshedTabIds: number[] = []
    const store = createTabStateStore([[7, true]])

    await expect(
      handlePopupMessage(createSetTabEnabledMessage(false), {
        getActiveTabId: async () => null,
        refreshActiveTab: async (tabId) => {
          refreshedTabIds.push(tabId)
        },
        tabStateStore: store,
      }),
    ).resolves.toEqual({
      enabled: false,
      status: 'Unavailable',
      type: POPUP_STATE_MESSAGE_TYPE,
    })

    expect(store.getTabPreference(7)).toBe(true)
    expect(refreshedTabIds).toEqual([])
  })
})

describe('popup view model', () => {
  it('shows On with an enabled active toggle', () => {
    expect(
      createPopupViewModel({
        enabled: true,
        status: 'On',
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: true,
      disabled: false,
      statusLine: 'On',
    })
  })

  it('shows Off with an enabled inactive toggle', () => {
    expect(
      createPopupViewModel({
        enabled: false,
        status: 'Off',
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: false,
      disabled: false,
      statusLine: 'Off',
    })
  })

  it('shows Unavailable with a disabled toggle', () => {
    expect(
      createPopupViewModel({
        enabled: true,
        status: 'Unavailable',
        type: POPUP_STATE_MESSAGE_TYPE,
      }),
    ).toEqual({
      checked: true,
      disabled: true,
      statusLine: 'Unavailable',
    })
  })
})
