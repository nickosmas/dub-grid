// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every surface that holds typed input inside something that closes (a modal,
 * a slide-over, a confirmation) asks before the input is thrown away (owner,
 * 2026-11-10). A new form that forgets fails here, so it gets a guard or a
 * reason it doesn't need one.
 */
const NOT_A_DIRTY_SURFACE: Record<string, string> = {
  "components/settings/DangerZone.tsx": "a typed delete confirmation; cancelling is the point",
  "components/staff-detail/DeleteStaffAccountCard.tsx": "a typed delete confirmation",
  "components/account/DeleteAccountCard.tsx": "a typed delete confirmation",
  "components/schedule/OpenShiftStaffingModal.tsx": "a search field over a pick list",
  "components/activity/ActivityLogParts.tsx": "filters",
  "components/gridmaster/GridmasterSecurityView.tsx": "a search field",
  "app/(app)/alerts/AlertsInboxPage.tsx": "a search field and selection",
  "components/RepeatForm.tsx": "reports its pattern through onDirtyChange; the shift editor asks",
};

const INPUT = /<input\b|<textarea\b|<CalendarDatePicker\b|<NumberField\b/;
const CLOSER = /<Modal\b|useSlideoverClose\(|<ConfirmDialog\b/;
const GUARD =
  /useUnsavedChangesPrompt|useNavigationGuard|hasUnsavedChanges|onRequestClose|UnsavedChangesBar|useConfirmLeave|unsaved:/;

function webSource(): string {
  const cwd = process.cwd();
  return existsSync(path.resolve(cwd, "apps/web/src"))
    ? path.resolve(cwd, "apps/web/src")
    : path.resolve(cwd, "src");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(entryPath);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [entryPath] : [];
  });
}

function unguardedFormSurfaces(root: string): string[] {
  return ["components", "app"]
    .flatMap((folder) => sourceFiles(path.join(root, folder)))
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return INPUT.test(source) && CLOSER.test(source) && !GUARD.test(source);
    })
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .filter((file) => !(file in NOT_A_DIRTY_SURFACE))
    .sort();
}

describe("unsaved changes coverage", () => {
  it("guards every form that closes", () => {
    expect(unguardedFormSurfaces(webSource())).toEqual([]);
  });

  it("lists only exemptions that still exist", () => {
    const root = webSource();
    const missing = Object.keys(NOT_A_DIRTY_SURFACE).filter(
      (file) => !existsSync(path.join(root, file)),
    );
    expect(missing).toEqual([]);
  });
});
