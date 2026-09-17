import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The real glyph map, read straight from the package. The test harness aliases
 * `@expo/vector-icons` to a name-carrying stub, so importing `Ionicons.glyphMap`
 * here would assert against the stub and prove nothing.
 */
const IONICONS_GLYPHS: Record<string, number> = JSON.parse(
  readFileSync(
    "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json",
    "utf8",
  ),
);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return collectSourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [path] : [];
  });
}

function collectIconNamesInUse(): string[] {
  const roots = ["src/features/profile", "src/features/people"];
  const names = new Set<string>();

  for (const root of roots) {
    for (const file of collectSourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/iconName="([a-z0-9-]+)"/g)) {
        names.add(match[1]);
      }
    }
  }

  return [...names].sort();
}

describe("profile and people row icons", () => {
  /**
   * A name with no glyph renders as nothing at all — an invisible row that is
   * very easy to miss in review. Read from the sources rather than a hardcoded
   * list, so a newly added row is covered without anyone remembering to list it
   * here.
   */
  it("names a real Ionicons glyph on every row", () => {
    const inUse = collectIconNamesInUse();

    expect(inUse.length).toBeGreaterThan(0);

    const missing = inUse.filter((name) => !(name in IONICONS_GLYPHS));

    expect(missing).toEqual([]);
  });

  /**
   * Icons are filled app-wide, so an accidentally outlined name would ship
   * one lighter icon in a list of solids.
   */
  it("uses the filled variant on every row", () => {
    const outlined = collectIconNamesInUse().filter((name) => name.endsWith("-outline"));

    expect(outlined).toEqual([]);
  });
});
