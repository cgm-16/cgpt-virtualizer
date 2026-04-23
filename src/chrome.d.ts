interface ChromeLastError {
  message?: string;
}

interface ChromeRuntimeMessageSender {
  tab?: ChromeTab;
}

interface ChromeRuntimeOnMessage {
  addListener(
    callback: (
      message: unknown,
      sender: ChromeRuntimeMessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void,
  ): void;
}

interface ChromeRuntimeApi {
  lastError: ChromeLastError | undefined;
  onMessage: ChromeRuntimeOnMessage;
  sendMessage(message: unknown, callback?: (response: unknown) => void): void;
}

interface ChromeTab {
  id?: number;
}

interface ChromeTabsApi {
  query(
    queryInfo: {
      active: boolean;
      currentWindow: boolean;
    },
    callback: (tabs: ChromeTab[]) => void,
  ): void;
  reload(tabId: number, callback?: () => void): void;
}

interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeStorageApi {
  session: ChromeStorageArea;
}

interface ChromeApi {
  runtime: ChromeRuntimeApi;
  storage: ChromeStorageApi;
  tabs: ChromeTabsApi;
}

declare const chrome: ChromeApi;
