import {
  applyScrollCorrection,
  captureAnchorSnapshot,
  resolveAnchorCorrection,
  type ViewportRect,
} from './anchor.ts'
import { OVERSCAN_VIEWPORT_COUNT } from '../shared/constants.ts'
import { patchMountedRange } from './patch.ts'
import { findRangeByScrollPosition, shouldSchedulePatch } from './range.ts'
import type { MountedRange, TranscriptSessionState } from './state.ts'

export interface SchedulePatchOptions {
  force?: boolean
}

export interface ScrollVirtualizationController {
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
  let patchFrameQueued = false
  let queuedRange: MountedRange | null = null

  const schedulePatch = (options: SchedulePatchOptions = {}) => {
    const nextRange = getMountedRangeForScrollPosition(state)

    if (nextRange === null) {
      return false
    }

    const currentTargetRange = queuedRange ?? state.mountedRange

    if (!options.force && !shouldSchedulePatch(currentTargetRange, nextRange)) {
      return false
    }

    queuedRange = nextRange

    if (patchFrameQueued) {
      return true
    }

    patchFrameQueued = true
    dependencies.requestAnimationFrame(() => {
      patchFrameQueued = false

      if (queuedRange === null) {
        return
      }

      const rangeToApply = queuedRange
      queuedRange = null
      applyMountedRangeUpdate(state, rangeToApply)
      dependencies.afterPatch?.(state)
    })

    return true
  }

  schedulePatch()
  state.scrollContainer.addEventListener(
    'scroll',
    () => {
      schedulePatch()
    },
    { passive: true },
  )

  return { schedulePatch }
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

  applyScrollCorrection(state.scrollContainer, correction)
  state.pendingScrollCorrection = 0
  state.anchor = captureAnchorSnapshot(state.records, resolveViewportRect(state.scrollContainer))
}

export function applyPendingAnchorCorrection(state: TranscriptSessionState): void {
  const correction = state.anchor === null ? 0 : state.pendingScrollCorrection

  applyScrollCorrection(state.scrollContainer, correction)
  state.pendingScrollCorrection = 0
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
