import { describe, expect, it } from "vitest";

import {
  createInMemoryStorage,
  createTabStateStore,
} from "../../src/background/tab-state.ts";

describe("tab state persistence across worker restarts", () => {
  it("a preference set in one store is visible in a second store using the same backing storage", async () => {
    const storage = createInMemoryStorage();
    const store1 = createTabStateStore(storage);

    await store1.setTabPreference(7, true);

    // Simulated worker restart: new store, same backing storage
    const store2 = createTabStateStore(storage);

    await expect(store2.getTabPreference(7)).resolves.toBe(true);
  });

  it("availability set in one store is visible in a second store using the same backing storage", async () => {
    const storage = createInMemoryStorage();
    const store1 = createTabStateStore(storage);

    await store1.setTabAvailability(7, "available");

    const store2 = createTabStateStore(storage);

    await expect(store2.getTabAvailability(7)).resolves.toBe("available");
  });

  it("defaults to false for preference on unseen tab after worker restart", async () => {
    const storage = createInMemoryStorage();
    const store = createTabStateStore(storage);

    await expect(store.getTabPreference(99)).resolves.toBe(false);
  });

  it("defaults to idle for availability on unseen tab after worker restart", async () => {
    const storage = createInMemoryStorage();
    const store = createTabStateStore(storage);

    await expect(store.getTabAvailability(99)).resolves.toBe("idle");
  });
});
