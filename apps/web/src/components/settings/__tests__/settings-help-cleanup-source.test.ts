import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function resolveRepoRoot(): string {
  const cwd = process.cwd();

  if (existsSync(resolve(cwd, "apps/web/src"))) {
    return cwd;
  }

  return resolve(cwd, "../..");
}

function readSettingsSource(path: string): string {
  return readFileSync(
    resolve(resolveRepoRoot(), "apps/web/src/components/settings", path),
    "utf-8",
  );
}

describe("settings explainer cleanup source guards", () => {
  it("removes settings-only explainer storage keys and component references", () => {
    const files = [
      "SettingsPage.tsx",
      "StringListSettings.tsx",
      "OrganizationLabels.tsx",
      "DisplayMode.tsx",
      "DepartmentsSettings.tsx",
      "Jobs.tsx",
      "AbsenceTypes.tsx",
      "Coverage.tsx",
    ].map((path) => readSettingsSource(path));

    for (const source of files) {
      expect(source).not.toContain("dg-explainer-");
      expect(source).not.toContain("ExplainerSection");
      expect(source).not.toContain("HelpHint");
    }
  });
});
