// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.match(/\.tsx?$/) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

describe("authenticated mobile read keys", () => {
  it("never places the raw access-token variable in an inline query key", () => {
    const rawTokenKey = /queryKey\s*:\s*\[[^\]]*\baccessToken\b[^\]]*\]/;
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => rawTokenKey.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(SOURCE_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
