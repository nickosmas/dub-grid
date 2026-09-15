import { afterEach, describe, expect, it, vi } from "vitest";

describe("server timing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not emit diagnostic headers unless explicitly enabled", async () => {
    vi.stubEnv("PERF_TIMING", "0");
    const { Timer } = await import("./server-timing");
    const timer = new Timer();
    timer.add("auth", 12.34);

    expect(timer.header()).toBeNull();
    const headers = new Headers();
    timer.applyTo(headers);
    expect(headers.has("Server-Timing")).toBe(false);
  });

  it("sanitizes metric names when diagnostic headers are enabled", async () => {
    vi.stubEnv("PERF_TIMING", "1");
    const { Timer } = await import("./server-timing");
    const timer = new Timer();
    timer.add("auth stage", 12.34);

    expect(timer.header()).toBe("auth_stage;dur=12.3");
  });

  it("exposes no description field that could carry account or tenant data", async () => {
    vi.stubEnv("PERF_TIMING", "1");
    const { Timer } = await import("./server-timing");
    const timer = new Timer();
    timer.add("auth", 12.34);

    expect(timer.header()).toBe("auth;dur=12.3");
    expect(timer.header()).not.toContain("desc=");
  });
});
