import { createReportContentAvailabilityMessage } from '../shared/messages.ts'
import { startContentRuntime } from './navigation.ts'
import { getCurrentTabVirtualizationEnabled } from './runtime-control.ts'

export interface ContentEntryDependencies {
  getCurrentTabVirtualizationEnabled?(): Promise<boolean>
  reportAvailability(message: ReturnType<typeof createReportContentAvailabilityMessage>): void
  startContentRuntime?(): void
}

export async function bootstrapContentEntry(
  dependencies: ContentEntryDependencies = createDefaultDependencies(),
): Promise<void> {
  const enabled =
    await (dependencies.getCurrentTabVirtualizationEnabled ?? getCurrentTabVirtualizationEnabled)()

  if (!enabled) {
    dependencies.reportAvailability(createReportContentAvailabilityMessage('idle'))
    return
  }

  ;(dependencies.startContentRuntime ?? startContentRuntime)()
}

function createDefaultDependencies(): ContentEntryDependencies {
  return {
    reportAvailability(message) {
      chrome.runtime.sendMessage(message)
    },
  }
}
