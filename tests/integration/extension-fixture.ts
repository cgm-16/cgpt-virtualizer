import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

const EXTENSION_DIRECTORY = join(process.cwd(), "dist");

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  page: Page;
  serviceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  context: async (fixtures, use) => {
    void fixtures;
    const userDataDirectory = await mkdtemp(
      join(tmpdir(), "cgpt-virtualizer-playwright-"),
    );
    const context = await chromium.launchPersistentContext(userDataDirectory, {
      args: [
        `--disable-extensions-except=${EXTENSION_DIRECTORY}`,
        `--load-extension=${EXTENSION_DIRECTORY}`,
      ],
      channel: "chromium",
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDirectory, {
        force: true,
        recursive: true,
      });
    }
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
  page: async ({ context }, use) => {
    const existingPage = context
      .pages()
      .find((candidate) => !candidate.url().startsWith("chrome-extension://"));

    await use(existingPage ?? (await context.newPage()));
  },
  serviceWorker: async ({ context }, use) => {
    const existingWorker = context.serviceWorkers()[0];
    await use(existingWorker ?? (await context.waitForEvent("serviceworker")));
  },
});

export { expect };
