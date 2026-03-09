import {
  createGetPopupStateMessage,
  createPopupStateMessage,
  createSetTabEnabledMessage,
  isWorkerToPopupMessage,
  type PopupToWorkerMessage,
  type WorkerToPopupMessage,
} from "./shared/messages.ts";
import { createPopupViewModel } from "./popup-view.ts";

const toggleElement = getToggleElement();
const statusLineElement = getStatusLineElement();

toggleElement.addEventListener("change", () => {
  void applyToggleChange(toggleElement.checked);
});

void bootstrapPopup();

async function bootstrapPopup(): Promise<void> {
  toggleElement.disabled = true;

  try {
    renderPopupState(await sendPopupMessage(createGetPopupStateMessage()));
  } catch {
    renderUnavailableState();
  }
}

async function applyToggleChange(enabled: boolean): Promise<void> {
  toggleElement.disabled = true;

  try {
    renderPopupState(
      await sendPopupMessage(createSetTabEnabledMessage(enabled)),
    );
  } catch {
    renderUnavailableState();
  }
}

function renderPopupState(message: WorkerToPopupMessage): void {
  const viewModel = createPopupViewModel(message);

  toggleElement.checked = viewModel.checked;
  toggleElement.disabled = viewModel.disabled;
  statusLineElement.textContent = viewModel.statusLine;
}

function renderUnavailableState(): void {
  renderPopupState(createPopupStateMessage(false, "Unavailable"));
}

function sendPopupMessage(
  message: PopupToWorkerMessage,
): Promise<WorkerToPopupMessage> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      const lastError = chrome.runtime.lastError;

      if (lastError !== undefined) {
        reject(
          new Error(lastError.message ?? "팝업 메시지 전송에 실패했습니다."),
        );
        return;
      }

      if (!isWorkerToPopupMessage(response)) {
        reject(new Error("유효하지 않은 팝업 상태 응답입니다."));
        return;
      }

      resolve(response);
    });
  });
}

function getToggleElement(): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>("#toggle");

  if (element === null) {
    throw new Error("팝업 토글 요소를 찾을 수 없습니다.");
  }

  return element;
}

function getStatusLineElement(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#status-line");

  if (element === null) {
    throw new Error("팝업 상태 요소를 찾을 수 없습니다.");
  }

  return element;
}
