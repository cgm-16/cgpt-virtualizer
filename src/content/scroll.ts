import {
  applyScrollCorrection,
  captureAnchorSnapshot,
  resolveAnchorCorrection,
  type ViewportRect,
} from './anchor.ts'
import {
  clearStreamingPlaceholder,
  renderStreamingPlaceholder,
  resolveStreamingGapEdge,
} from './placeholder.ts'
import { OVERSCAN_VIEWPORT_COUNT } from '../shared/constants.ts'
import { patchMountedRange } from './patch.ts'
import { findRangeByScrollPosition, shouldSchedulePatch } from './range.ts'
import type { MountedRange, TranscriptSessionState } from './state.ts'

export interface SchedulePatchOptions {
  afterPatch?: (state: TranscriptSessionState) => void
  force?: boolean
}

export interface ScrollVirtualizationController {
  disconnect(): void
  schedulePatch(options?: SchedulePatchOptions): boolean
}

export interface ScrollVirtualizationDependencies {
  afterPatch?(state: TranscriptSessionState): void
  requestAnimationFrame(callback: FrameRequestCallback): number
}

export function initializeScrollVirtualization(
  state: TranscriptSessionState,
  dependencies: ScrollVirtualizationDependencies = createDefaultDependencies(),
): ScrollVirtualizationController {
  let destroyed = false
  let patchFrameQueued = false
  let queuedAfterPatch: ((state: TranscriptSessionState) => void) | null = null
  let queuedRange: MountedRange | null = null

  const schedulePatch = (options: SchedulePatchOptions = {}) => {
    if (destroyed) {
      return false
    }

    const nextRange = getMountedRangeForScrollPosition(state)

    if (nextRange === null) {
      return false
    }

    const currentTargetRange = queuedRange ?? state.mountedRange

    if (!options.force && !shouldSchedulePatch(currentTargetRange, nextRange)) {
      return false
    }

    queuedRange = nextRange
    queuedAfterPatch = mergeAfterPatchCallbacks(queuedAfterPatch, options.afterPatch)

    if (patchFrameQueued) {
      return true
    }

    patchFrameQueued = true
    dependencies.requestAnimationFrame(() => {
      patchFrameQueued = false

      if (destroyed || queuedRange === null) {
        return
      }

      const rangeToApply = queuedRange
      const afterPatch = queuedAfterPatch
      queuedRange = null
      queuedAfterPatch = null

      if (state.isStreaming) {
        applyPendingAnchorCorrection(state)
        const placeholderEdge = resolveStreamingGapEdge(state.mountedRange, rangeToApply)

        if (placeholderEdge === null) {
          clearStreamingPlaceholder(state)
        } else {
          renderStreamingPlaceholder(state, placeholderEdge)
        }

        return
      }

      clearStreamingPlaceholder(state)
      applyMountedRangeUpdate(state, rangeToApply)
      afterPatch?.(state)
      dependencies.afterPatch?.(state)
    })

    return true
  }

  schedulePatch()
  const scrollListener = () => {
    schedulePatch()
  }

  state.scrollContainer.addEventListener('scroll', scrollListener, { passive: true })

  return {
    disconnect() {
      if (destroyed) {
        return
      }

      destroyed = true
      patchFrameQueued = false
      queuedRange = null
      queuedAfterPatch = null
      state.scrollContainer.removeEventListener('scroll', scrollListener)
    },
    schedulePatch,
  }
}

function mergeAfterPatchCallbacks(
  currentCallback: ((state: TranscriptSessionState) => void) | null,
  nextCallback: ((state: TranscriptSessionState) => void) | undefined,
): ((state: TranscriptSessionState) => void) | null {
  if (nextCallback === undefined) {
    return currentCallback
  }

  if (currentCallback === null) {
    return nextCallback
  }

  return (state) => {
    currentCallback(state)
    nextCallback(state)
  }
}

function createDefaultDependencies(): ScrollVirtualizationDependencies {
  return {
    requestAnimationFrame(callback) {
      return window.requestAnimationFrame(callback)
    },
  }
}

export function getMountedRangeForScrollPosition(
  state: TranscriptSessionState,
): MountedRange | null {
  const viewportHeight = resolveViewportHeight(state.scrollContainer)

  return findRangeByScrollPosition(
    state.prefixSums,
    state.scrollContainer.scrollTop,
    viewportHeight,
    viewportHeight * OVERSCAN_VIEWPORT_COUNT,
    viewportHeight * OVERSCAN_VIEWPORT_COUNT,
  )
}

export function applyMountedRangeUpdate(
  state: TranscriptSessionState,
  range: MountedRange,
): void {
  const viewportRect = resolveViewportRect(state.scrollContainer)
  const anchor = captureAnchorSnapshot(state.records, viewportRect)

  patchMountedRange(state, range.start, range.end)
  const correction =
    anchor === null
      ? 0
      : state.pendingScrollCorrection + resolveAnchorCorrection(anchor, viewportRect.top)

  state.pendingScrollCorrection = 0
  applyScrollCorrection(state.scrollContainer, correction)
  state.anchor = captureAnchorSnapshot(state.records, resolveViewportRect(state.scrollContainer))
}

export function applyPendingAnchorCorrection(state: TranscriptSessionState): void {
  const correction = state.anchor === null ? 0 : state.pendingScrollCorrection

  state.pendingScrollCorrection = 0
  applyScrollCorrection(state.scrollContainer, correction)
  state.anchor = captureAnchorSnapshot(state.records, resolveViewportRect(state.scrollContainer))
}

function resolveViewportHeight(scrollContainer: HTMLElement): number {
  return scrollContainer.clientHeight || scrollContainer.getBoundingClientRect().height
}

function resolveViewportRect(scrollContainer: HTMLElement): ViewportRect {
  const rect = scrollContainer.getBoundingClientRect()
  const height = resolveViewportHeight(scrollContainer)

  return {
    bottom: rect.top + height,
    top: rect.top,
  }
}
