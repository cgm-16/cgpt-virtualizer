import { extractConversationId } from "../shared/routes.ts";
import {
  bootstrapContentScript,
  type ContentBootstrapDependencies,
  type ContentBootstrapResult,
} from "./bootstrap.ts";

type TranscriptConversationId = ReturnType<typeof extractConversationId>;
type NavigationListener = (pathname: string) => void;
type HistoryMethodName = "pushState" | "replaceState";
type HistoryMethod = (
  data: unknown,
  unused: string,
  url?: string | URL | null,
) => void;

const navigationStateByWindow = new WeakMap<Window, WindowNavigationState>();

export interface NavigationHooksController {
  disconnect(): void;
}

export interface InstallNavigationHooksDependencies {
  queueMicrotask?(callback: () => void): void;
  window: Window;
}

export interface ContentRuntimeController {
  destroy(): void;
}

export interface ContentRuntimeDependencies extends Omit<
  ContentBootstrapDependencies,
  "pathname"
> {
  bootstrapContentScript?(
    dependencies: ContentBootstrapDependencies,
  ): DestroyableContentBootstrapResult;
  installNavigationHooks?(
    callback: NavigationListener,
    dependencies: InstallNavigationHooksDependencies,
  ): NavigationHooksController;
  queueMicrotask?(callback: () => void): void;
  window: Window;
}

interface WindowNavigationState {
  disconnect(): void;
  listeners: Set<NavigationListener>;
}

type DestroyableContentBootstrapResult = ContentBootstrapResult & {
  destroy(): void;
};

export function installNavigationHooks(
  callback: NavigationListener,
  dependencies: InstallNavigationHooksDependencies = createDefaultNavigationHookDependencies(),
): NavigationHooksController {
  let state = navigationStateByWindow.get(dependencies.window);

  if (state === undefined) {
    state = createWindowNavigationState(dependencies);
    navigationStateByWindow.set(dependencies.window, state);
  }

  state.listeners.add(callback);

  return {
    disconnect() {
      const activeState = navigationStateByWindow.get(dependencies.window);

      if (activeState === undefined) {
        return;
      }

      activeState.listeners.delete(callback);

      if (activeState.listeners.size > 0) {
        return;
      }

      activeState.disconnect();
      navigationStateByWindow.delete(dependencies.window);
    },
  };
}

export function patchHistoryMethod(
  methodName: HistoryMethodName,
  history: History,
  emitNavigationSignal: () => void,
): () => void {
  const originalMethod = history[methodName] as HistoryMethod;
  const patchedMethod: HistoryMethod = (data, unused, url) => {
    originalMethod.call(history, data, unused, url);
    emitNavigationSignal();
  };

  history[methodName] = patchedMethod as History[HistoryMethodName];

  return () => {
    if (history[methodName] !== patchedMethod) {
      return;
    }

    history[methodName] = originalMethod as History[HistoryMethodName];
  };
}

export function shouldResetSession(
  previousConversationId: TranscriptConversationId,
  nextConversationId: TranscriptConversationId,
): boolean {
  return previousConversationId !== nextConversationId;
}

export function startContentRuntime(
  dependencies: ContentRuntimeDependencies = createDefaultContentRuntimeDependencies(),
): ContentRuntimeController {
  const bootstrap =
    dependencies.bootstrapContentScript ?? bootstrapContentScript;
  const navigationHooksInstaller =
    dependencies.installNavigationHooks ?? installNavigationHooks;
  const bootstrapDependencies = {
    clearTimeout: dependencies.clearTimeout,
    createMutationObserver: dependencies.createMutationObserver,
    createResizeObserver: dependencies.createResizeObserver,
    document: dependencies.document,
    reportAvailability: dependencies.reportAvailability,
    requestAnimationFrame: dependencies.requestAnimationFrame,
    setTimeout: dependencies.setTimeout,
  } satisfies Omit<ContentBootstrapDependencies, "pathname">;

  let activeConversationId = extractConversationId(
    dependencies.window.location.pathname,
  );
  let activeBootstrap = bootstrap({
    ...bootstrapDependencies,
    pathname: dependencies.window.location.pathname,
  });

  const navigationHooks = navigationHooksInstaller(handleNavigationSignal, {
    queueMicrotask: dependencies.queueMicrotask,
    window: dependencies.window,
  });

  function handleNavigationSignal(pathname: string): void {
    const nextConversationId = extractConversationId(pathname);

    if (!shouldResetSession(activeConversationId, nextConversationId)) {
      return;
    }

    activeBootstrap.destroy();
    activeBootstrap = bootstrap({
      ...bootstrapDependencies,
      pathname,
    });
    activeConversationId = nextConversationId;
  }

  return {
    destroy() {
      navigationHooks.disconnect();
      activeBootstrap.destroy();
    },
  };
}

function createDefaultNavigationHookDependencies(): InstallNavigationHooksDependencies {
  return {
    window,
  };
}

function createDefaultContentRuntimeDependencies(): ContentRuntimeDependencies {
  return {
    document,
    reportAvailability(message) {
      chrome.runtime.sendMessage(message);
    },
    window,
  };
}

function createWindowNavigationState(
  dependencies: InstallNavigationHooksDependencies,
): WindowNavigationState {
  const listeners = new Set<NavigationListener>();
  const queueMicrotask =
    dependencies.queueMicrotask ??
    dependencies.window.queueMicrotask.bind(dependencies.window);
  const emitNavigationSignal = (pathname: string) => {
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(pathname);
      }
    });
  };
  const restorePushState = patchHistoryMethod(
    "pushState",
    dependencies.window.history,
    () => emitNavigationSignal(dependencies.window.location.pathname),
  );
  const restoreReplaceState = patchHistoryMethod(
    "replaceState",
    dependencies.window.history,
    () => emitNavigationSignal(dependencies.window.location.pathname),
  );
  const popstateListener = () => {
    emitNavigationSignal(dependencies.window.location.pathname);
  };

  dependencies.window.addEventListener("popstate", popstateListener);

  return {
    disconnect() {
      restorePushState();
      restoreReplaceState();
      dependencies.window.removeEventListener("popstate", popstateListener);
    },
    listeners,
  };
}
