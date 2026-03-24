import { expect, test } from "./extension-fixture.ts";
import {
  expectInitialMountedWindow,
  expectPopupState,
  openEnabledFixture,
} from "./chatgpt-fixture.ts";

test("팝업 On 상태가 일관되게 렌더링된다", async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({
    height: 900,
    width: 1280,
  });

  const helperPage = await openEnabledFixture(
    page,
    context,
    extensionId,
    "/c/bubble-50?fixture=bubble-50",
  );

  await helperPage.setViewportSize({
    height: 280,
    width: 360,
  });
  await expectPopupState(helperPage, {
    enabled: true,
    status: "On",
  });
  await helperPage.reload({
    waitUntil: "domcontentloaded",
  });
  await expect(helperPage.locator("#toggle")).toBeChecked();
  await expect(helperPage.locator("#status-line")).toHaveText("On");
  await expect(helperPage.locator("main")).toHaveScreenshot("popup-on.png");
});

test("transcript 초기 mounted window가 일관되게 렌더링된다", async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({
    height: 900,
    width: 1280,
  });

  const helperPage = await openEnabledFixture(
    page,
    context,
    extensionId,
    "/c/bubble-50?fixture=bubble-50",
  );
  await helperPage.close();

  await expectInitialMountedWindow(page);
  await expect(page.locator("[data-cgpt-scroll-container]")).toHaveScreenshot(
    "transcript-mounted-window.png",
  );
});
