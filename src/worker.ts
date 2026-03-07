import {
  createGetTabStatusMessage,
  createTabStatusMessage,
  type PopupToWorkerMessage,
  type WorkerToPopupMessage,
} from './shared/messages.ts'
import { createRuntimeStatus } from './shared/types.ts'

const bootstrapRequest: PopupToWorkerMessage = createGetTabStatusMessage()
const bootstrapResponse: WorkerToPopupMessage = createTabStatusMessage(
  createRuntimeStatus('Off'),
)

// 서비스 워커 진입점
console.log('cgpt-virtualizer worker loaded', {
  bootstrapRequest,
  bootstrapResponse,
})
