import {
  createDisableTabVirtualizationMessage,
  createGetTabEnabledMessage,
  isWorkerToContentMessage,
} from "../shared/messages.ts";

export interface RuntimeControlDependencies {
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
}

export function getCurrentTabVirtualizationEnabled(
  dependencies: RuntimeControlDependencies = createDefaultDependencies(),
): Promise<boolean> {
  return new Promise((resolve) => {
    dependencies.sendMessage(createGetTabEnabledMessage(), (response) => {
      if (
        chrome.runtime.lastError !== undefined ||
        !isWorkerToContentMessage(response)
      ) {
        resolve(false);
        return;
      }

      resolve(response.enabled);
    });
  });
}

export function disableCurrentTabVirtualization(
  dependencies: RuntimeControlDependencies = createDefaultDependencies(),
): Promise<void> {
  return new Promise((resolve) => {
    dependencies.sendMessage(createDisableTabVirtualizationMessage(), () => {
      resolve();
    });
  });
}

function createDefaultDependencies(): RuntimeControlDependencies {
  return {
    sendMessage(message, callback) {
      chrome.runtime.sendMessage(message, callback);
    },
  };
}
