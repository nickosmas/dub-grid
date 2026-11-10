import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative, resolve } from "path";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  return existsSync(resolve(cwd, "apps/web/src")) ? cwd : resolve(cwd, "../..");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("Add buttons", () => {
  // Labels say what they do without a typed "+" in front ("Add shift", not
  // "+ Add shift"), on web and mobile alike (owner, 2026-11-09). Prettier puts
  // an arithmetic `+` at the end of a line, so a line starting "+ " is JSX text;
  // overflow counts ("+3") have no space and stay.
  it("never start a label with a plus sign", () => {
    const root = resolveRepoRoot();
    const offenders = ["apps/web/src", "apps/mobile/src", "apps/mobile/app"].flatMap((dir) =>
      sourceFiles(resolve(root, dir)).flatMap((file) =>
        readFileSync(file, "utf-8")
          .split("\n")
          .flatMap((line, index) =>
            /^\s+\+ [A-Za-z{]/.test(line) ? [`${relative(root, file)}:${index + 1}`] : [],
          ),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
