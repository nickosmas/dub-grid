import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function resolveMobileRoot(): string {
  const cwd = process.cwd();
  return existsSync(path.resolve(cwd, "apps/mobile"))
    ? path.resolve(cwd, "apps/mobile")
    : path.resolve(cwd);
}

function listProductionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "__tests__") return [];
      return listProductionFiles(entryPath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
      ? [entryPath]
      : [];
  });
}

const mobileRoot = resolveMobileRoot();
const productionFiles = ["app", "src"].flatMap((directory) =>
  listProductionFiles(path.resolve(mobileRoot, directory)),
);

function relative(filePath: string): string {
  return path.relative(mobileRoot, filePath).replaceAll(path.sep, "/");
}

describe("mobile typography contract", () => {
  it("bounds DM Sans to startup loading and the wordmark", () => {
    const allowed = new Set(["app/_layout.tsx", "src/shared/components/DubGridWordmark.tsx"]);
    const violations = productionFiles
      .filter((filePath) => /DMSans_|DM Sans/.test(readFileSync(filePath, "utf8")))
      .map(relative)
      .filter((filePath) => !allowed.has(filePath));

    expect(violations).toEqual([]);
  });

  it("routes editable product fields through the load-safe Inter helper", () => {
    for (const filePath of [
      "src/features/auth/components/AuthField.tsx",
      "src/features/profile/components/ProfilePrimitives.tsx",
      "src/shared/components/SearchBar.tsx",
    ]) {
      expect(readFileSync(path.resolve(mobileRoot, filePath), "utf8"), filePath).toContain(
        "mobileInputText",
      );
    }
  });

  it("caps shared field scaling so editable text stays inside its control", () => {
    for (const filePath of [
      "src/features/auth/components/AuthField.tsx",
      "src/features/profile/components/ProfilePrimitives.tsx",
      "src/shared/components/SearchBar.tsx",
    ]) {
      expect(readFileSync(path.resolve(mobileRoot, filePath), "utf8"), filePath).toContain(
        "maxFontSizeMultiplier={MAX_FONT_SCALE}",
      );
    }
  });

  it("uses one cross-platform autofill hint per field", () => {
    const violations = productionFiles
      .filter((filePath) => /textContentType=/.test(readFileSync(filePath, "utf8")))
      .map(relative);

    expect(violations).toEqual([]);
  });

  it("lets the credentials field focus after mounting with stable native metrics", () => {
    const loginSource = readFileSync(
      path.resolve(mobileRoot, "src/features/auth/screens/LoginScreen.tsx"),
      "utf8",
    );

    expect(loginSource).toMatch(/accessibilityLabel="Email"[\s\S]*?autoFocus/);
    expect(loginSource).not.toContain("emailInputRef.current?.focus()");
  });

  it("keeps direct product families behind shared Inter aliases", () => {
    const violations = productionFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return /fontFamily:\s*["']DMSans_/.test(source) ? [relative(filePath)] : [];
    });

    expect(violations).toEqual([]);
  });

  it("applies the shared tabular style to schedule and dashboard figures", () => {
    for (const filePath of [
      "src/features/dashboard/components/DashboardHeroCard.tsx",
      "src/features/dashboard/components/DashboardHeader.tsx",
      "src/features/dashboard/components/MyScheduleCard.tsx",
      "src/features/schedule/screens/scheduleScreenStyles.ts",
      "src/features/schedule/screens/shiftDetailScreenStyles.ts",
    ]) {
      expect(readFileSync(path.resolve(mobileRoot, filePath), "utf8"), filePath).toContain(
        "mobileTabularText",
      );
    }
  });
});
