import type { BubbleRecord } from './state.ts'

export function buildPrefixSums(records: BubbleRecord[]): number[] {
  let total = 0

  return records.map((record) => {
    total += record.measuredHeight
    return total
  })
}

export function rebuildPrefixSumsFromIndex(
  prefixSums: number[],
  records: BubbleRecord[],
  changedIndex: number,
): number[] {
  if (
    records.length === 0 ||
    changedIndex <= 0 ||
    changedIndex >= records.length ||
    prefixSums.length !== records.length
  ) {
    return buildPrefixSums(records)
  }

  const rebuilt = prefixSums.slice(0, changedIndex)
  let total = rebuilt[changedIndex - 1] ?? 0

  for (let index = changedIndex; index < records.length; index += 1) {
    total += records[index].measuredHeight
    rebuilt[index] = total
  }

  return rebuilt
}

export function extendPrefixSums(
  prefixSums: number[],
  appendedRecords: BubbleRecord[],
): number[] {
  if (appendedRecords.length === 0) {
    return prefixSums.slice()
  }

  if (prefixSums.length === 0) {
    return buildPrefixSums(appendedRecords)
  }

  const extended = prefixSums.slice()
  let total = extended[extended.length - 1] ?? 0

  for (const record of appendedRecords) {
    total += record.measuredHeight
    extended.push(total)
  }

  return extended
}
