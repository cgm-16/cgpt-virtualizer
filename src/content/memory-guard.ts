import type { TranscriptSessionState } from './state.ts'

export interface DetachedCachePressure {
  detachedNodeCount: number
  estimatedDetachedHeight: number
}

export interface MemoryGuardThreshold {
  detachedNodeCount: number
  estimatedDetachedHeight: number
}

export const DEFAULT_MEMORY_GUARD_THRESHOLD: MemoryGuardThreshold = {
  detachedNodeCount: 2_000,
  estimatedDetachedHeight: 500_000,
}

export function estimateDetachedCachePressure(
  state: TranscriptSessionState,
): DetachedCachePressure {
  return state.records.reduce<DetachedCachePressure>(
    (pressure, record) => {
      if (record.mounted) {
        return pressure
      }

      pressure.detachedNodeCount += 1
      pressure.estimatedDetachedHeight += record.measuredHeight

      return pressure
    },
    {
      detachedNodeCount: 0,
      estimatedDetachedHeight: 0,
    },
  )
}

export function shouldDisableVirtualizationForMemory(
  pressure: DetachedCachePressure,
  threshold: MemoryGuardThreshold = DEFAULT_MEMORY_GUARD_THRESHOLD,
): boolean {
  return (
    pressure.detachedNodeCount >= threshold.detachedNodeCount ||
    pressure.estimatedDetachedHeight >= threshold.estimatedDetachedHeight
  )
}
