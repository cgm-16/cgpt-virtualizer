// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  estimateDetachedCachePressure,
  shouldDisableVirtualizationForMemory,
  type MemoryGuardThreshold,
} from '../../src/content/memory-guard.ts'
import type { BubbleRecord, TranscriptSessionState } from '../../src/content/state.ts'

describe('estimateDetachedCachePressure', () => {
  it('unmounted record만 detached pressure로 계산한다', () => {
    const sessionState = makeSessionState(
      [
        { height: 100, mounted: true },
        { height: 120, mounted: false },
        { height: 80, mounted: false },
        { height: 60, mounted: true },
      ],
    )

    expect(estimateDetachedCachePressure(sessionState)).toEqual({
      detachedNodeCount: 2,
      estimatedDetachedHeight: 200,
    })
  })
})

describe('shouldDisableVirtualizationForMemory', () => {
  it('node count threshold를 넘으면 guard를 발동한다', () => {
    const threshold: MemoryGuardThreshold = {
      detachedNodeCount: 3,
      estimatedDetachedHeight: 1_000,
    }

    expect(
      shouldDisableVirtualizationForMemory(
        {
          detachedNodeCount: 3,
          estimatedDetachedHeight: 100,
        },
        threshold,
      ),
    ).toBe(true)
  })

  it('estimated height threshold를 넘으면 guard를 발동한다', () => {
    const threshold: MemoryGuardThreshold = {
      detachedNodeCount: 10,
      estimatedDetachedHeight: 250,
    }

    expect(
      shouldDisableVirtualizationForMemory(
        {
          detachedNodeCount: 2,
          estimatedDetachedHeight: 251,
        },
        threshold,
      ),
    ).toBe(true)
  })

  it('threshold 아래면 guard를 발동하지 않는다', () => {
    const threshold: MemoryGuardThreshold = {
      detachedNodeCount: 5,
      estimatedDetachedHeight: 400,
    }

    expect(
      shouldDisableVirtualizationForMemory(
        {
          detachedNodeCount: 4,
          estimatedDetachedHeight: 399,
        },
        threshold,
      ),
    ).toBe(false)
  })
})

function makeSessionState(
  recordsInput: Array<{ height: number; mounted: boolean }>,
): TranscriptSessionState {
  document.body.innerHTML = ''

  const transcriptRoot = document.createElement('section')
  const scrollContainer = document.createElement('main')
  const records: BubbleRecord[] = recordsInput.map(({ height, mounted }, index) => {
    const node = document.createElement('article')
    node.textContent = `Bubble ${index}`

    if (mounted) {
      transcriptRoot.append(node)
    }

    return {
      index,
      measuredHeight: height,
      mounted,
      node,
      pinned: false,
    }
  })

  scrollContainer.append(transcriptRoot)
  document.body.append(scrollContainer)

  return {
    anchor: null,
    dirtyRebuildReason: null,
    isStreaming: false,
    mountedRange: null,
    pendingScrollCorrection: 0,
    prefixSums: buildPrefixSums(recordsInput.map(({ height }) => height)),
    records,
    scrollContainer,
    transcriptRoot,
  }
}

function buildPrefixSums(heights: number[]): number[] {
  return heights.reduce<number[]>((prefixSums, height) => {
    const previousHeight = prefixSums[prefixSums.length - 1] ?? 0
    prefixSums.push(previousHeight + height)
    return prefixSums
  }, [])
}
