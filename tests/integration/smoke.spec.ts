/**
 * Popup smoke tests
 *
 * Covers:
 *   - The extension popup page loads and renders the correct default state
 *   - The toggle is interactive and responds to clicks via the real UI
 *
 * Does NOT cover:
 *   - Real ChatGPT DOM or selector drift — all ChatGPT pages use synthetic fixtures
 *   - Full virtualization behavior — see content-bootstrap.spec.ts for that
 */
import { test, expect } from "./extension-fixture.ts";
import { installFixtureRoutes } from "./chatgpt-fixture.ts";

test("통합 테스트 하네스가 실제 확장을 로드한다", async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  expect(serviceWorker.url()).toContain(extensionId);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator("#toggle")).toBeVisible();
  await expect(page.locator("#status-line")).toHaveText("Off");
});

test("팝업 토글 클릭이 실제 UI를 통해 활성화 상태를 변경한다", async ({
  context,
  extensionId,
  page,
}) => {
  await installFixtureRoutes(context);
  await page.goto("https://chatgpt.com/c/bubble-50?fixture=bubble-50");
  await page.waitForLoadState("domcontentloaded");

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  // Wait for bootstrap to complete — toggle starts disabled and becomes enabled once state loads
  await expect(popupPage.locator("#toggle:not([disabled])")).toBeVisible();
  await expect(popupPage.locator("#status-line")).toHaveText("Off");

  await popupPage.locator("#toggle").click();

  // After the click, the toggle should be checked (enabled=true stored in background)
  await expect(popupPage.locator("#toggle")).toBeChecked();
});
