import { createReportContentAvailabilityMessage } from '../shared/messages.ts'
import type { ContentAvailability } from '../shared/types.ts'
import { isSupportedTranscriptPath } from '../shared/routes.ts'
import { resolveAvailability } from './availability.ts'
import { resolveSelectors } from './selectors.ts'

export interface ContentBootstrapDependencies {
  document: Document
  pathname: string
  reportAvailability(message: ReturnType<typeof createReportContentAvailabilityMessage>): void
}

export function bootstrapContentScript(
  dependencies: ContentBootstrapDependencies = createDefaultDependencies(),
): ContentAvailability {
  const selectors = isSupportedTranscriptPath(dependencies.pathname)
    ? resolveSelectors(dependencies.document)
    : null
  const availability = resolveAvailability(dependencies.pathname, selectors)

  dependencies.reportAvailability(createReportContentAvailabilityMessage(availability))

  return availability
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
