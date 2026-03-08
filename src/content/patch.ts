import { assertMountedWindowBounds, isDebugModeEnabled } from './debug.ts'
import type { BubbleRecord, TranscriptSessionState } from './state.ts'

const TOP_SPACER_ATTRIBUTE = 'data-cgpt-top-spacer'
const BOTTOM_SPACER_ATTRIBUTE = 'data-cgpt-bottom-spacer'

export function ensureTopSpacer(root: HTMLElement): HTMLElement {
  const existing = findDirectChildSpacer(root, TOP_SPACER_ATTRIBUTE)

  if (existing !== null) {
    root.insertBefore(existing, root.firstChild)
    return existing
  }

  const spacer = root.ownerDocument.createElement('div')
  spacer.setAttribute('aria-hidden', 'true')
  spacer.setAttribute(TOP_SPACER_ATTRIBUTE, '')
  root.insertBefore(spacer, root.firstChild)

  return spacer
}

export function ensureBottomSpacer(root: HTMLElement): HTMLElement {
  const existing = findDirectChildSpacer(root, BOTTOM_SPACER_ATTRIBUTE)

  if (existing !== null) {
    root.append(existing)
    return existing
  }

  const spacer = root.ownerDocument.createElement('div')
  spacer.setAttribute('aria-hidden', 'true')
  spacer.setAttribute(BOTTOM_SPACER_ATTRIBUTE, '')
  root.append(spacer)

  return spacer
}

export function computeSpacerHeights(
  prefixSums: number[],
  start: number,
  end: number,
  totalCount: number,
): { bottom: number; top: number } {
  const top = start === 0 ? 0 : (prefixSums[start - 1] ?? 0)
  const totalHeight = totalCount === 0 ? 0 : (prefixSums[totalCount - 1] ?? 0)
  const mountedHeight = (prefixSums[end] ?? 0) - (start === 0 ? 0 : (prefixSums[start - 1] ?? 0))

  return {
    bottom: totalHeight - top - mountedHeight,
    top,
  }
}

export function buildMountedFragment(
  records: BubbleRecord[],
  start: number,
  end: number,
): DocumentFragment {
  const fragment = records[start]?.node.ownerDocument.createDocumentFragment()

  if (fragment === undefined) {
    throw new RangeError('buildMountedFragment requires a valid inclusive range.')
  }

  for (let index = start; index <= end; index += 1) {
    fragment.append(records[index].node)
  }

  return fragment
}

export function patchMountedRange(
  state: TranscriptSessionState,
  start: number,
  end: number,
): void {
  if (
    state.records.length === 0 ||
    start < 0 ||
    end < start ||
    end >= state.records.length
  ) {
    throw new RangeError('patchMountedRange requires a valid inclusive range.')
  }

  const topSpacer = ensureTopSpacer(state.transcriptRoot)
  const bottomSpacer = ensureBottomSpacer(state.transcriptRoot)
  const { top, bottom } = computeSpacerHeights(state.prefixSums, start, end, state.records.length)

  topSpacer.style.height = `${top}px`
  bottomSpacer.style.height = `${bottom}px`

  detachMountedRangeOutsideNextWindow(state, start, end)

  const fragment = buildMountedFragment(state.records, start, end)
  state.transcriptRoot.insertBefore(fragment, bottomSpacer)
  updateMountedFlags(state.records, start, end)
  state.mountedRange = { start, end }

  if (isDebugModeEnabled()) {
    assertMountedWindowBounds(state, start, end)
  }
}

function detachMountedRangeOutsideNextWindow(
  state: TranscriptSessionState,
  start: number,
  end: number,
): void {
  for (const record of state.records) {
    if (
      (record.index < start || record.index > end) &&
      record.node.parentElement === state.transcriptRoot
    ) {
      state.transcriptRoot.removeChild(record.node)
    }
  }
}

function updateMountedFlags(
  records: BubbleRecord[],
  start: number,
  end: number,
): void {
  for (const record of records) {
    record.mounted = record.index >= start && record.index <= end
  }
}

function findDirectChildSpacer(
  root: HTMLElement,
  attributeName: string,
): HTMLElement | null {
  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement && child.hasAttribute(attributeName)) {
      return child
    }
  }

  return null
}
