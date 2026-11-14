import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { config } from "zod/v4/core";

describe("zod-jitless", () => {
  afterEach(() => {
    config({ jitless: false });
    vi.restoreAllMocks();
  });

  it("turns off zod's compiled parsers, and with them the eval probe", async () => {
    await import("./zod-jitless");
    expect(config().jitless).toBe(true);

    const construct = vi.spyOn(globalThis, "Function");
    expect(z.object({ id: z.guid() }).safeParse({ id: "x" }).success).toBe(false);
    expect(construct).not.toHaveBeenCalled();
  });

  it("is the first thing the browser entry point loads", () => {
    const source = readFileSync(path.join(__dirname, "../instrumentation-client.ts"), "utf8");
    const firstImport = source.match(/^import\s+[^;]*;/m)?.[0];
    expect(firstImport).toBe('import "@/lib/zod-jitless";');
  });
});
