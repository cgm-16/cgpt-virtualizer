// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installNavigationHooks,
  shouldResetSession,
  startContentRuntime,
} from "../../src/content/navigation.ts";

describe("shouldResetSession", () => {
  it("conversation ID가 달라지면 reset이 필요하다", () => {
    expect(shouldResetSession("alpha", "beta")).toBe(true);
    expect(shouldResetSession("alpha", null)).toBe(true);
    expect(shouldResetSession(null, "beta")).toBe(true);
  });

  it("conversation ID가 같으면 reset이 필요하지 않다", () => {
    expect(shouldResetSession("alpha", "alpha")).toBe(false);
    expect(shouldResetSession(null, null)).toBe(false);
  });
});

describe("installNavigationHooks", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("pushState, replaceState, popstate마다 현재 pathname 발행을 예약한다", () => {
    window.history.replaceState({}, "", "/c/original");

    const queuedCallbacks: Array<() => void> = [];
    const pathnames: string[] = [];
    const controller = installNavigationHooks(
      (pathname) => {
        pathnames.push(pathname);
      },
      {
        queueMicrotask(callback) {
          queuedCallbacks.push(callback);
        },
        window,
      },
    );

    window.history.pushState({}, "", "/c/next");
    window.history.replaceState({}, "", "/c/final");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(pathnames).toEqual([]);

    queuedCallbacks.splice(0).forEach((callback) => {
      callback();
    });

    expect(pathnames).toEqual(["/c/next", "/c/final", "/c/final"]);

    controller.disconnect();

    window.history.pushState({}, "", "/c/after-disconnect");

    queuedCallbacks.splice(0).forEach((callback) => {
      callback();
    });

    expect(pathnames).toEqual(["/c/next", "/c/final", "/c/final"]);
  });
});

describe("startContentRuntime", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("conversation ID가 바뀌면 이전 세션을 destroy하고 새 경로를 다시 bootstrap한다", () => {
    window.history.replaceState({}, "", "/c/alpha");

    const bootstrapResults: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    const bootstrapContentScript = vi.fn(() => {
      const result = {
        availability: "idle" as const,
        destroy: vi.fn(),
        scanResult: null,
        sessionState: null,
      };

      bootstrapResults.push(result);
      return result;
    });

    let navigationHandler: ((pathname: string) => void) | null = null;
    const disconnectNavigationHooks = vi.fn();
    const runtime = startContentRuntime({
      bootstrapContentScript,
      document,
      installNavigationHooks(callback) {
        navigationHandler = callback;

        return {
          disconnect: disconnectNavigationHooks,
        };
      },
      reportAvailability() {},
      window,
    });

    expect(bootstrapContentScript).toHaveBeenCalledTimes(1);
    expect(bootstrapContentScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: "/c/alpha",
      }),
    );

    expect(navigationHandler).not.toBeNull();

    if (navigationHandler === null) {
      throw new Error("navigation handler가 등록되지 않았다");
    }

    navigationHandler("/c/beta");

    expect(bootstrapResults[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(bootstrapContentScript).toHaveBeenCalledTimes(2);
    expect(bootstrapContentScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: "/c/beta",
      }),
    );

    runtime.destroy();

    expect(disconnectNavigationHooks).toHaveBeenCalledTimes(1);
    expect(bootstrapResults[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("같은 conversation ID면 파괴적 재초기화를 건너뛴다", () => {
    window.history.replaceState({}, "", "/c/alpha");

    const bootstrapContentScript = vi.fn(() => ({
      availability: "idle" as const,
      destroy: vi.fn(),
      scanResult: null,
      sessionState: null,
    }));

    let navigationHandler: ((pathname: string) => void) | null = null;
    startContentRuntime({
      bootstrapContentScript,
      document,
      installNavigationHooks(callback) {
        navigationHandler = callback;

        return {
          disconnect() {},
        };
      },
      reportAvailability() {},
      window,
    });

    expect(navigationHandler).not.toBeNull();

    if (navigationHandler === null) {
      throw new Error("navigation handler가 등록되지 않았다");
    }

    navigationHandler("/c/alpha");

    expect(bootstrapContentScript).toHaveBeenCalledTimes(1);
    expect(
      bootstrapContentScript.mock.results[0]?.value.destroy,
    ).not.toHaveBeenCalled();
  });
});
