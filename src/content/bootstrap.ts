import { createReportContentAvailabilityMessage } from '../shared/messages.ts'
import type { ContentAvailability } from '../shared/types.ts'
import { isSupportedTranscriptPath } from '../shared/routes.ts'
import { resolveAvailability } from './availability.ts'
import { resolveSelectors } from './selectors.ts'
import { scanTranscript, type TranscriptScanResult } from './transcript-scan.ts'

export interface ContentBootstrapDependencies {
  document: Document
  pathname: string
  reportAvailability(message: ReturnType<typeof createReportContentAvailabilityMessage>): void
}

export interface ContentBootstrapResult {
  availability: ContentAvailability
  scanResult: TranscriptScanResult | null
}

export function bootstrapContentScript(
  dependencies: ContentBootstrapDependencies = createDefaultDependencies(),
): ContentBootstrapResult {
  const selectors = isSupportedTranscriptPath(dependencies.pathname)
    ? resolveSelectors(dependencies.document)
    : null
  const availability = resolveAvailability(dependencies.pathname, selectors)

  dependencies.reportAvailability(createReportContentAvailabilityMessage(availability))

  const scanResult = selectors !== null ? scanTranscript(selectors) : null

  return { availability, scanResult }
}

function createDefaultDependencies(): ContentBootstrapDependencies {
  return {
    document,
    pathname: window.location.pathname,
    reportAvailability(message) {
      chrome.runtime.sendMessage(message)
    },
  }
}
