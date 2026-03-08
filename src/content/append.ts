import {
  APPEND_QUIET_PERIOD_MS,
  NEAR_BOTTOM_THRESHOLD_PX,
} from '../shared/constants.ts'
import {
  isNearBottom,
  snapToBottom,
} from './bottom-follow.ts'
import { extendPrefixSums } from './prefix-sums.ts'
import type { DirtyRebuildReason } from './rebuild.ts'
import type { SchedulePatchOptions } from './scroll.ts'
import {
  buildBubbleRecords,
  type BubbleRecord,
  type TranscriptSessionState,
} from './state.ts'

export interface MutationObserverLike {
  disconnect(): void
  observe(target: Node, options?: MutationObserverInit): void
  takeRecords(): MutationRecord[]
}

export interface AppendObserverManager {
  disconnect(): void
  flushPendingMutationRecords(): void
}

export interface AppendObserverManagerDependencies {
  clearTimeout(handle: number): void
  createMutationObserver(callback: MutationCallback): MutationObserverLike
  isTranscriptBubble(node: Node): node is Element
  measure(node: Element): number
  requestDirtyRebuild(state: TranscriptSessionState, reason: DirtyRebuildReason): void
  schedulePatch(options?: SchedulePatchOptions): boolean
  setTimeout(callback: () => void, delay: number): number
}

export type AppendValidationResult =
  | { kind: 'accepted'; nodes: Element[] }
  | { kind: 'invalid'; reason: DirtyRebuildReason }
  | { kind: 'noop' }

export function createAppendObserverManager(
  state: TranscriptSessionState,
  dependencies: AppendObserverManagerDependencies,
): AppendObserverManager {
  let pendingNodes: Element[] = []
  let quietPeriodTimer: number | null = null

  const observer = dependencies.createMutationObserver((mutations) => {
    const validation = validateTailAppendMutations(
      state.records,
      state.transcriptRoot,
      mutations,
      dependencies.isTranscriptBubble,
    )

    if (validation.kind === 'noop') {
      return
    }

    if (validation.kind === 'invalid') {
      pendingNodes = []

      if (quietPeriodTimer !== null) {
        dependencies.clearTimeout(quietPeriodTimer)
        quietPeriodTimer = null
      }

      dependencies.requestDirtyRebuild(state, validation.reason)
      return
    }

    pendingNodes = mergePendingNodes(pendingNodes, validation.nodes)

    if (quietPeriodTimer !== null) {
      dependencies.clearTimeout(quietPeriodTimer)
    }

    quietPeriodTimer = dependencies.setTimeout(() => {
      quietPeriodTimer = null
      commitPendingAppends(state, pendingNodes, dependencies)
      pendingNodes = []
    }, APPEND_QUIET_PERIOD_MS)
  })

  observer.observe(state.transcriptRoot, { childList: true })

  return {
    disconnect() {
      pendingNodes = []

      if (quietPeriodTimer !== null) {
        dependencies.clearTimeout(quietPeriodTimer)
        quietPeriodTimer = null
      }

      observer.disconnect()
    },
    flushPendingMutationRecords() {
      observer.takeRecords()
    },
  }
}

export function validateTailAppendMutations(
  records: readonly BubbleRecord[],
  transcriptRoot: HTMLElement,
  mutations: readonly MutationRecord[],
  isTranscriptBubble: (node: Node) => node is Element,
): AppendValidationResult {
  const knownNodes = new Set(records.map((record) => record.node))
  const appendedNodes: Element[] = []

  for (const mutation of mutations) {
    if (mutation.removedNodes.length > 0) {
      return { kind: 'invalid', reason: 'append-removal' }
    }

    for (const node of Array.from(mutation.addedNodes)) {
      if (!isTranscriptBubble(node)) {
        return { kind: 'invalid', reason: 'append-unmatched-node' }
      }

      if (knownNodes.has(node)) {
        return { kind: 'invalid', reason: 'append-existing-node' }
      }

      if (node.parentElement !== transcriptRoot) {
        return { kind: 'invalid', reason: 'append-non-tail' }
      }

      appendedNodes.push(node)
    }
  }

  if (appendedNodes.length === 0) {
    return { kind: 'noop' }
  }

  const tailChildren = Array.from(transcriptRoot.children).slice(-appendedNodes.length)

  for (let index = 0; index < appendedNodes.length; index += 1) {
    if (tailChildren[index] !== appendedNodes[index]) {
      return { kind: 'invalid', reason: 'append-non-tail' }
    }
  }

  return {
    kind: 'accepted',
    nodes: appendedNodes,
  }
}

function commitPendingAppends(
  state: TranscriptSessionState,
  pendingNodes: Element[],
  dependencies: AppendObserverManagerDependencies,
): void {
  if (pendingNodes.length === 0) {
    return
  }

  const shouldFollowBottom = isNearBottom(
    state.scrollContainer,
    NEAR_BOTTOM_THRESHOLD_PX,
  )
  const appendedRecords = buildAppendedRecords(
    pendingNodes,
    state.records.length,
    dependencies.measure,
  )

  state.records.push(...appendedRecords)
  state.prefixSums = extendPrefixSums(state.prefixSums, appendedRecords)
  dependencies.schedulePatch(
    shouldFollowBottom
      ? {
          afterPatch() {
            snapToBottom(state.scrollContainer)
          },
          force: true,
        }
      : { force: true },
  )
}

function buildAppendedRecords(
  nodes: Element[],
  startIndex: number,
  measure: (node: Element) => number,
): BubbleRecord[] {
  return buildBubbleRecords(nodes, measure).map((record, index) => ({
    ...record,
    index: startIndex + index,
  }))
}

function mergePendingNodes(
  pendingNodes: Element[],
  nextNodes: Element[],
): Element[] {
  const seen = new Set(pendingNodes)
  const merged = pendingNodes.slice()

  for (const node of nextNodes) {
    if (seen.has(node)) {
      continue
    }

    merged.push(node)
    seen.add(node)
  }

  return merged
}
