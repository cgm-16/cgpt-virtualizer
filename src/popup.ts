import { createGetTabStatusMessage } from './shared/messages.ts'
import { createRuntimeStatus } from './shared/types.ts'

// 팝업 진입점
const bootstrapStatus = createRuntimeStatus('Off')
const bootstrapMessage = createGetTabStatusMessage()

console.log('cgpt-virtualizer popup loaded', {
  bootstrapMessage,
  bootstrapStatus,
})
