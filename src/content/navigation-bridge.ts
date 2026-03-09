type HistoryMethodName = "pushState" | "replaceState";
type HistoryMethod = (
  data: unknown,
  unused: string,
  url?: string | URL | null,
) => void;

export const PAGE_NAVIGATION_MESSAGE_TYPE = "cgpt-virtualizer:navigation";
export const PAGE_NAVIGATION_BRIDGE_MARKER =
  "__cgptVirtualizerNavigationBridgeInstalled";
export const PAGE_NAVIGATION_MESSAGE_SOURCE = "cgpt-virtualizer";

export function installPageNavigationBridge(window: Window): void {
  const bridgedWindow = window as Window & Record<string, unknown>;

  if (bridgedWindow[PAGE_NAVIGATION_BRIDGE_MARKER]) {
    return;
  }

  bridgedWindow[PAGE_NAVIGATION_BRIDGE_MARKER] = true;

  const emit = () => {
    window.postMessage(
      {
        source: PAGE_NAVIGATION_MESSAGE_SOURCE,
        type: PAGE_NAVIGATION_MESSAGE_TYPE,
        pathname: window.location.pathname,
      },
      window.location.origin,
    );
  };

  const patch = (methodName: HistoryMethodName) => {
    const originalMethod = window.history[methodName] as HistoryMethod;

    window.history[methodName] = ((data, unused, url) => {
      originalMethod.call(window.history, data, unused, url);
      emit();
    }) as History[HistoryMethodName];
  };

  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", emit);
}
