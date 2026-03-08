import type { BubbleRecord } from './state.ts'

export interface AnchorSnapshot {
  index: number
  node: Element
  offset: number
}

export interface ViewportRect {
  top: number
  bottom: number
}

export function selectAnchorBubble(
  mountedRecords: BubbleRecord[],
  viewportRect: ViewportRect,
): BubbleRecord | null {
  for (const record of mountedRecords) {
    if (!record.mounted) {
      continue
    }

    const rect = record.node.getBoundingClientRect()

    if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
      return record
    }
  }

  return null
}

export function computeAnchorOffset(anchorNode: Element, viewportTop: number): number {
  return anchorNode.getBoundingClientRect().top - viewportTop
}

export function captureAnchorSnapshot(
  mountedRecords: BubbleRecord[],
  viewportRect: ViewportRect,
): AnchorSnapshot | null {
  const anchorBubble = selectAnchorBubble(mountedRecords, viewportRect)

  if (anchorBubble === null) {
    return null
  }

  return {
    index: anchorBubble.index,
    node: anchorBubble.node,
    offset: computeAnchorOffset(anchorBubble.node, viewportRect.top),
  }
}

export function accumulateScrollCorrection(
  currentCorrection: number,
  anchor: AnchorSnapshot | null,
  changedIndex: number,
  heightDelta: number,
): number {
  if (anchor === null || changedIndex >= anchor.index) {
    return currentCorrection
  }

  return currentCorrection + heightDelta
}

export function resolveAnchorCorrection(
  anchor: AnchorSnapshot | null,
  viewportTop: number,
): number {
  if (anchor === null || !anchor.node.isConnected) {
    return 0
  }

  return computeAnchorOffset(anchor.node, viewportTop) - anchor.offset
}

export function applyScrollCorrection(
  scrollContainer: HTMLElement,
  correction: number,
): void {
  if (correction === 0) {
    return
  }

  scrollContainer.scrollTop += correction
}
