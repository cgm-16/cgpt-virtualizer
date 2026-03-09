import { test, expect } from "./extension-fixture.ts";

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
