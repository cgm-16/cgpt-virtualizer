import { describe, expect, it, vi } from "vitest";

import { bootstrapContentEntry } from "../../src/content/startup.ts";

describe("bootstrapContentEntry", () => {
  it("현재 탭이 활성화되어 있으면 content runtime을 시작한다", async () => {
    const reportAvailability = vi.fn();
    const startContentRuntime = vi.fn();

    await bootstrapContentEntry({
      getCurrentTabVirtualizationEnabled: async () => true,
      reportAvailability,
      startContentRuntime,
    });

    expect(startContentRuntime).toHaveBeenCalledTimes(1);
    expect(reportAvailability).not.toHaveBeenCalled();
  });

  it("현재 탭이 비활성화되어 있으면 idle을 보고하고 runtime을 시작하지 않는다", async () => {
    const reportAvailability = vi.fn();
    const startContentRuntime = vi.fn();

    await bootstrapContentEntry({
      getCurrentTabVirtualizationEnabled: async () => false,
      reportAvailability,
      startContentRuntime,
    });

    expect(reportAvailability).toHaveBeenCalledWith({
      availability: "idle",
      type: "runtime/report-content-availability",
    });
    expect(startContentRuntime).not.toHaveBeenCalled();
  });
});
