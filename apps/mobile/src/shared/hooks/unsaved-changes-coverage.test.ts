import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every sheet or pushed screen holding typed input asks before it is thrown
 * away (owner, 2026-11-10). A new one that forgets fails here.
 */
const NOT_A_DIRTY_SURFACE: Record<string, string> = {
  "src/features/auth/screens/LoginScreen.tsx": "sign-in fields",
  "src/features/auth/screens/ForgotPasswordScreen.tsx": "an email to send a code to",
  "src/features/auth/screens/ResetPasswordScreen.tsx": "a code and a new password",
  "src/features/profile/components/MobileStepUpSheet.tsx": "a password or code to confirm",
  "src/features/profile/components/ProfilePrimitives.tsx":
    "shared building blocks, guarded by their screens",
};

const INPUT = /TextInput|TextField|FormField|<Input\b/;
const SURFACE = /BottomSheetModal|FullPageSheet|Stack\.Screen|router\./;
const GUARD = /useUnsavedChangesGuard|useNavigationDiscardGuard/;

function mobileRoot(): string {
  const cwd = process.cwd();
  return existsSync(path.resolve(cwd, "apps/mobile"))
    ? path.resolve(cwd, "apps/mobile")
    : path.resolve(cwd);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(entryPath);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [entryPath] : [];
  });
}

describe("unsaved changes coverage", () => {
  it("guards every sheet and screen with a text field", () => {
    const root = mobileRoot();
    const unguarded = ["src", "app"]
      .flatMap((folder) => sourceFiles(path.join(root, folder)))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return INPUT.test(source) && SURFACE.test(source) && !GUARD.test(source);
      })
      .map((file) => path.relative(root, file).split(path.sep).join("/"))
      .filter((file) => !(file in NOT_A_DIRTY_SURFACE))
      .sort();

    expect(unguarded).toEqual([]);
  });

  it("lists only exemptions that still exist", () => {
    const root = mobileRoot();
    expect(
      Object.keys(NOT_A_DIRTY_SURFACE).filter((file) => !existsSync(path.join(root, file))),
    ).toEqual([]);
  });
});
