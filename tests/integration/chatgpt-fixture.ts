import type { BrowserContext, Page } from "@playwright/test";

import { expect } from "./extension-fixture.ts";

const CHATGPT_BASE_URL = "https://chatgpt.com";

export interface PopupState {
  enabled: boolean;
  status: "Off" | "On" | "Unavailable";
}

export async function openEnabledFixture(
  page: Page,
  context: BrowserContext,
  extensionId: string,
  requestPath: string,
): Promise<Page> {
  await installFixtureRoutes(context);
  await page.goto(`${CHATGPT_BASE_URL}${requestPath}`);

  const helperPage = await openHelperPage(context, extensionId);
  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
    }),
    setExtensionEnabled(helperPage, true),
  ]);
  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded");

  return helperPage;
}

export async function openHelperPage(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const helperPage = await context.newPage();
  await helperPage.goto(`chrome-extension://${extensionId}/popup.html`);
  return helperPage;
}

export async function setExtensionEnabled(
  helperPage: Page,
  enabled: boolean,
): Promise<void> {
  await helperPage.evaluate(async (nextEnabled) => {
    const tabs = await chrome.tabs.query({
      url: ["https://chatgpt.com/*"],
    });
    const targetTabId = tabs[0]?.id;

    if (typeof targetTabId !== "number") {
      throw new Error("활성화할 ChatGPT 탭을 찾을 수 없습니다.");
    }

    await chrome.tabs.update(targetTabId, { active: true });

    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          enabled: nextEnabled,
          type: "runtime/set-tab-enabled",
        },
        resolve,
      );
    });
  }, enabled);
}

export async function getPopupState(helperPage: Page): Promise<PopupState> {
  return helperPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({
      url: ["https://chatgpt.com/*"],
    });
    const targetTabId = tabs[0]?.id;

    if (typeof targetTabId === "number") {
      await chrome.tabs.update(targetTabId, { active: true });
    }

    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "runtime/get-popup-state" }, resolve);
    });
  }) as Promise<PopupState>;
}

export async function expectPopupState(
  helperPage: Page,
  expectedState: PopupState,
): Promise<void> {
  await expect
    .poll(async () => await getPopupState(helperPage))
    .toMatchObject(expectedState);
}

export async function expectInitialMountedWindow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const transcriptRoot = document.querySelector(
          "[data-cgpt-transcript-root]",
        );
        const children =
          transcriptRoot === null ? [] : Array.from(transcriptRoot.children);

        return {
          firstBubbleText: children[1]?.textContent ?? null,
          lastBubbleText: children.at(-2)?.textContent ?? null,
        };
      }),
    )
    .toEqual({
      firstBubbleText: "Bubble 0",
      lastBubbleText: "Bubble 3",
    });
}

async function installFixtureRoutes(context: BrowserContext): Promise<void> {
  await context.route(`${CHATGPT_BASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());

    await route.fulfill({
      body: renderFixtureHtml(`${url.pathname}${url.search}`),
      contentType: "text/html; charset=utf-8",
      status: 200,
    });
  });
}

function renderFixtureHtml(requestPath: string): string {
  const url = new URL(`${CHATGPT_BASE_URL}${requestPath}`);
  const fixture = url.searchParams.get("fixture");
  const fixtureBodies = {
    available: renderFixtureBody("available"),
    "bubble-0": renderFixtureBody("bubble-0"),
    "bubble-49": renderFixtureBody("bubble-49"),
    "bubble-50": renderFixtureBody("bubble-50"),
    "bubble-2501": renderFixtureBody("bubble-2501"),
    "bubble-50-alt": renderFixtureBody("bubble-50-alt"),
    missing: renderFixtureBody("missing"),
  };

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>content bootstrap fixture</title>
  </head>
  <body>
    ${renderFixtureBody(fixture)}
    <script>
      window.__allBubbles = Array.from(document.querySelectorAll('[data-cgpt-transcript-bubble]'))
      window.__fixtureBodies = ${JSON.stringify(fixtureBodies)}
      window.__tailAppendNodes = []
      window.__replaceFixture = function replaceFixture(nextFixture) {
        document.body.innerHTML = window.__fixtureBodies[nextFixture] ?? '<main></main>'
        window.__allBubbles = Array.from(document.querySelectorAll('[data-cgpt-transcript-bubble]'))
        window.__tailAppendNodes = []
      }
    </script>
  </body>
</html>`;
}

function renderBubbles(count: number, labelPrefix = "Bubble"): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `<article data-cgpt-transcript-bubble style="display: block; height: 100px;">${labelPrefix} ${index}</article>`,
  ).join("\n          ");
}

function renderFixtureBody(fixture: string | null): string {
  if (fixture === "available") {
    return `
      <main data-cgpt-scroll-container style="height: 200px; overflow-y: auto;">
        <section data-cgpt-transcript-root>
          <article data-cgpt-transcript-bubble style="display: block; height: 100px;">Bubble</article>
        </section>
        <div data-cgpt-streaming-indicator hidden></div>
      </main>
    `;
  }

  if (fixture === "missing") {
    return `
      <main data-cgpt-scroll-container></main>
    `;
  }

  if (
    fixture === "bubble-0" ||
    fixture === "bubble-49" ||
    fixture === "bubble-2501" ||
    fixture === "bubble-50" ||
    fixture === "bubble-50-alt"
  ) {
    const count =
      fixture === "bubble-0"
        ? 0
        : fixture === "bubble-49"
          ? 49
          : fixture === "bubble-2501"
            ? 2501
            : 50;
    const labelPrefix = fixture === "bubble-50-alt" ? "Next Bubble" : "Bubble";

    return `
      <main data-cgpt-scroll-container style="height: 200px; overflow-y: auto;">
        <section data-cgpt-transcript-root>
          ${renderBubbles(count, labelPrefix)}
        </section>
        <div data-cgpt-streaming-indicator hidden></div>
      </main>
    `;
  }

  return "<main></main>";
}
