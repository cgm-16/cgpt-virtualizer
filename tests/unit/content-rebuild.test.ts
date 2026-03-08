// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  createStructuralRebuildObserverManager,
  runDirtyRebuild,
} from '../../src/content/rebuild.ts'
import type { MutationObserverLike } from '../../src/content/append.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('runDirtyRebuild', () => {
  it('rehydrates detached records around the live mounted DOM and restores scrollTop from a surviving anchor', () => {
    const fixture = makeDirtyRebuildFixture()
    const disconnectObservers = vi.fn()
    const reconnectObservers = vi.fn()
    const schedulePatch = vi.fn(() => true)

    fixture.sessionState.anchor = {
      index: 4,
      node: fixture.bubbles[4]!,
      offset: 0,
    }
    fixture.bubbles[4]!.getBoundingClientRect = () =>
      makeDomRect({
        bottom: 0,
        left: 0,
        right: 100,
        top: -100,
      })
    fixture.transcriptRoot.removeChild(fixture.bubbles[3]!)

    const didRebuild = runDirtyRebuild(fixture.sessionState, 'append-removal', {
      bubbleSelector: '[data-cgpt-transcript-bubble]',
      detectStreamingState() {
        return false
      },
      disconnectObservers,
      document,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0
      },
      reconnectObservers,
      resolveSelectors() {
        return {
          bubbleSelector: '[data-cgpt-transcript-bubble]',
          scrollContainer: fixture.scrollContainer,
          streamingIndicatorSelector: '[data-cgpt-streaming-indicator]',
          transcriptRoot: fixture.transcriptRoot,
        }
      },
      schedulePatch,
      streamingIndicatorSelector: '[data-cgpt-streaming-indicator]',
    })

    expect(didRebuild).toBe(true)
    expect(disconnectObservers).toHaveBeenCalledTimes(1)
    expect(reconnectObservers).toHaveBeenCalledTimes(1)
    expect(schedulePatch).toHaveBeenCalledWith({ force: true })
    expect(fixture.scrollContainer.scrollTop).toBe(300)
    expect(fixture.sessionState.records.map((record) => record.node.textContent)).toEqual([
      'Bubble 0',
      'Bubble 1',
      'Bubble 2',
      'Bubble 4',
      'Bubble 5',
    ])
    expect(fixture.sessionState.prefixSums).toEqual([100, 200, 300, 400, 500])
    expect(fixture.sessionState.dirtyRebuildReason).toBeNull()
  })

  it('falls back to raw scrollTop when the anchor bubble no longer survives', () => {
    const fixture = makeDirtyRebuildFixture()
    const schedulePatch = vi.fn(() => true)

    fixture.transcriptRoot.removeChild(fixture.bubbles[4]!)

    const didRebuild = runDirtyRebuild(fixture.sessionState, 'append-removal', {
      bubbleSelector: '[data-cgpt-transcript-bubble]',
      detectStreamingState() {
        return false
      },
      disconnectObservers() {},
      document,
      measure(node) {
        return fixture.measuredHeights.get(node) ?? 0
      },
      reconnectObservers() {},
      resolveSelectors() {
        return {
          bubbleSelector: '[data-cgpt-transcript-bubble]',
          scrollContainer: fixture.scrollContainer,
          streamingIndicatorSelector: '[data-cgpt-streaming-indicator]',
          transcriptRoot: fixture.transcriptRoot,
        }
      },
      schedulePatch,
      streamingIndicatorSelector: '[data-cgpt-streaming-indicator]',
    })

    expect(didRebuild).toBe(true)
    expect(schedulePatch).toHaveBeenCalledWith({ force: true })
    expect(fixture.scrollContainer.scrollTop).toBe(400)
    expect(fixture.sessionState.records.map((record) => record.node.textContent)).toEqual([
      'Bubble 0',
      'Bubble 1',
      'Bubble 2',
      'Bubble 3',
      'Bubble 5',
    ])
  })
})

describe('createStructuralRebuildObserverManager', () => {
  it('requests a dirty rebuild for unsafe subtree childList mutations', () => {
    const fixture = makeDirtyRebuildFixture()
    let callback: MutationCallback | null = null
    const requestDirtyRebuild = vi.fn()

    createStructuralRebuildObserverManager(fixture.sessionState, {
      createMutationObserver(nextCallback) {
        callback = nextCallback
        return createNoopMutationObserver()
      },
      requestDirtyRebuild,
    })

    const nestedNode = document.createElement('span')
    fixture.bubbles[4]?.append(nestedNode)
    callback?.(
      [makeChildListMutationRecord(fixture.bubbles[4]!, [nestedNode])],
      {} as MutationObserver,
    )

    expect(requestDirtyRebuild).toHaveBeenCalledWith(
      fixture.sessionState,
      'unsafe-structural-change',
    )
  })

  it('requests a dirty rebuild for unsafe subtree characterData mutations', () => {
    const fixture = makeDirtyRebuildFixture()
    let callback: MutationCallback | null = null
    const requestDirtyRebuild = vi.fn()
    const textNode = document.createTextNode('before')

    fixture.bubbles[4]?.append(textNode)

    createStructuralRebuildObserverManager(fixture.sessionState, {
      createMutationObserver(nextCallback) {
        callback = nextCallback
        return createNoopMutationObserver()
      },
      requestDirtyRebuild,
    })

    textNode.data = 'after'
    callback?.(
      [makeCharacterDataMutationRecord(textNode)],
      {} as MutationObserver,
    )

    expect(requestDirtyRebuild).toHaveBeenCalledWith(
      fixture.sessionState,
      'unsafe-structural-change',
    )
  })
})

function makeDirtyRebuildFixture(): {
  bubbles: HTMLElement[]
  measuredHeights: Map<Element, number>
  scrollContainer: HTMLElement
  sessionState: TranscriptSessionState
  transcriptRoot: HTMLElement
} {
  document.body.innerHTML = ''

  const scrollContainer = document.createElement('main')
  const transcriptRoot = document.createElement('section')
  const streamingIndicator = document.createElement('div')
  const measuredHeights = new Map<Element, number>()
  const bubbles = Array.from({ length: 6 }, (_, index) => {
    const bubble = createBubble(`Bubble ${index}`)
    measuredHeights.set(bubble, 100)
    return bubble
  })

  const topSpacer = document.createElement('div')
  topSpacer.setAttribute('data-cgpt-top-spacer', '')
  const bottomSpacer = document.createElement('div')
  bottomSpacer.setAttribute('data-cgpt-bottom-spacer', '')

  transcriptRoot.append(topSpacer, bubbles[3]!, bubbles[4]!, bubbles[5]!, bottomSpacer)
  scrollContainer.append(transcriptRoot, streamingIndicator)
  scrollContainer.scrollTop = 400
  document.body.append(scrollContainer)

  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: 200,
  })
  scrollContainer.getBoundingClientRect = () =>
    makeDomRect({
      bottom: 200,
      left: 0,
      right: 100,
      top: 0,
    })

  bubbles[3]!.getBoundingClientRect = () =>
    makeDomRect({
      bottom: 0,
      left: 0,
      right: 100,
      top: -100,
    })
  bubbles[4]!.getBoundingClientRect = () =>
    makeDomRect({
      bottom: 100,
      left: 0,
      right: 100,
      top: 0,
    })
  bubbles[5]!.getBoundingClientRect = () =>
    makeDomRect({
      bottom: 200,
      left: 0,
      right: 100,
      top: 100,
    })

  const records = bubbles.map((bubble, index): BubbleRecord => ({
    index,
    measuredHeight: 100,
    mounted: index >= 3,
    node: bubble,
    pinned: false,
  }))

  return {
    bubbles,
    measuredHeights,
    scrollContainer,
    sessionState: {
      anchor: null,
      dirtyRebuildReason: null,
      isStreaming: false,
      mountedRange: { end: 5, start: 3 },
      pendingScrollCorrection: 0,
      prefixSums: [100, 200, 300, 400, 500, 600],
      records,
      scrollContainer,
      transcriptRoot,
    },
    transcriptRoot,
  }
}

function createBubble(label: string): HTMLElement {
  const bubble = document.createElement('article')

  bubble.setAttribute('data-cgpt-transcript-bubble', '')
  bubble.textContent = label

  return bubble
}

function createNoopMutationObserver(): MutationObserverLike {
  return {
    disconnect() {},
    observe() {},
    takeRecords() {
      return []
    },
  }
}

function makeChildListMutationRecord(
  target: Node,
  addedNodes: Node[],
  removedNodes: Node[] = [],
): MutationRecord {
  return {
    addedNodes: addedNodes as unknown as NodeList,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: removedNodes as unknown as NodeList,
    target,
    type: 'childList',
  } as MutationRecord
}

function makeCharacterDataMutationRecord(target: CharacterData): MutationRecord {
  return {
    addedNodes: [] as unknown as NodeList,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: 'before',
    previousSibling: null,
    removedNodes: [] as unknown as NodeList,
    target,
    type: 'characterData',
  } as MutationRecord
}

function makeDomRect(
  rect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
): DOMRect {
  return {
    ...rect,
    height: rect.bottom - rect.top,
    toJSON() {
      return this
    },
    width: rect.right - rect.left,
    x: rect.left,
    y: rect.top,
  } as DOMRect
}
