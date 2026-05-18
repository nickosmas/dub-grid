import { readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "app");

function collectFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const entryPath = join(path, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      return collectFiles(entryPath);
    }

    return entryPath;
  });
}

describe("Expo Router app tree", () => {
  it("does not include test files in the route directory", () => {
    const appFiles = collectFiles(appRoot);

    expect(
      appFiles.filter((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)),
    ).toEqual([]);
  });
});
