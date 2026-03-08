import type { MountedRange } from './state.ts'

export function findRangeByScrollPosition(
  prefixSums: number[],
  scrollTop: number,
  viewportHeight: number,
  overscanTopPx: number,
  overscanBottomPx: number,
): MountedRange | null {
  if (prefixSums.length === 0 || viewportHeight <= 0) {
    return null
  }

  const totalHeight = prefixSums[prefixSums.length - 1] ?? 0
  const rangeStartPx = Math.max(0, scrollTop - overscanTopPx)
  const rangeEndPx = Math.min(totalHeight, scrollTop + viewportHeight + overscanBottomPx)

  if (rangeEndPx <= rangeStartPx) {
    return null
  }

  const start = upperBound(prefixSums, rangeStartPx)
  const end = lowerBound(prefixSums, rangeEndPx)

  if (start >= prefixSums.length || end < start) {
    return null
  }

  return { start, end }
}

export function shouldSchedulePatch(
  currentRange: MountedRange | null,
  nextRange: MountedRange,
): boolean {
  return (
    currentRange === null ||
    currentRange.start !== nextRange.start ||
    currentRange.end !== nextRange.end
  )
}

function lowerBound(values: number[], target: number): number {
  let low = 0
  let high = values.length - 1
  let result = values.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)

    if ((values[middle] ?? 0) >= target) {
      result = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return result
}

function upperBound(values: number[], target: number): number {
  let low = 0
  let high = values.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)

    if ((values[middle] ?? 0) <= target) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}
