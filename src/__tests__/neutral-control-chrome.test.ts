import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { relative, resolve } from "path";

import { buttonVariants } from "@/components/ui/button";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
const settingsPage = readFileSync(resolve(process.cwd(), "src/components/settings/SettingsPage.tsx"), "utf-8");
const gridmasterPortal = readFileSync(resolve(process.cwd(), "src/components/gridmaster/GridmasterPortal.tsx"), "utf-8");
const staffView = readFileSync(resolve(process.cwd(), "src/components/StaffView.tsx"), "utf-8");
const shiftCodes = readFileSync(resolve(process.cwd(), "src/components/settings/ShiftCodes.tsx"), "utf-8");
const toolbar = readFileSync(resolve(process.cwd(), "src/components/Toolbar.tsx"), "utf-8");

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return collectSourceFiles(fullPath);
    }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

describe("shared chrome theming", () => {
  it("uses brand blue for the default button variant", () => {
    expect(buttonVariants({ variant: "default" })).toContain(
      "bg-[var(--color-brand)]",
    );
    expect(buttonVariants({ variant: "default" })).toContain(
      "hover:bg-[var(--color-brand-light)]",
    );
  });

  it("exposes an explicit blue brand button variant", () => {
    expect(buttonVariants({ variant: "brand" })).toContain(
      "bg-[var(--color-brand)]",
    );
  });

  it("defines the neutral control token ramp in globals", () => {
    expect(globalsCss).toContain("--color-control-primary: #0F172A;");
    expect(globalsCss).toContain("--color-control-active-bg: #F1F5F9;");
    expect(globalsCss).toContain("--color-control-active-border: #CBD5E1;");
  });

  it("uses soft blue tokens for shared active navigation chrome", () => {
    expect(globalsCss).toMatch(
      /\.dg-nav-tab\.active\s*\{[\s\S]*background: var\(--color-brand-bg\);[\s\S]*border-color: var\(--color-brand-border\);[\s\S]*color: var\(--color-brand\);[\s\S]*\}/,
    );
  });

  it("uses the navbar-link highlight recipe for app sidebars", () => {
    for (const source of [settingsPage, gridmasterPortal, staffView]) {
      expect(source).toContain("data-[active=true]:bg-[var(--color-brand-bg)]");
      expect(source).toContain("data-[active=true]:text-[var(--color-brand)]");
    }
  });

  it("keeps audited primary buttons and selectors on theme blue", () => {
    expect(shiftCodes).toContain(
      'className="dg-btn dg-btn-primary dg-btn-sm"',
    );
    expect(shiftCodes).toContain('className="dg-btn dg-btn-secondary dg-btn-sm"');
    expect(toolbar).toContain('background: toolsOpen ? "var(--color-brand-bg)" : undefined');
    expect(toolbar).toContain('color: toolsOpen ? "var(--color-brand)" : undefined');
    expect(globalsCss).toMatch(
      /\.dg-checkbox:checked\s*\{[\s\S]*background: var\(--color-brand\);[\s\S]*border-color: var\(--color-brand\);[\s\S]*\}/,
    );
  });

  it("limits neutral control tokens to structural row and drag chrome", () => {
    const allowedFiles = [
      "src/components/StaffView.tsx",
      "src/components/settings/DepartmentsSettings.tsx",
      "src/components/settings/StringListSettings.tsx",
      "src/components/staff/StaffContextBar.tsx",
      "src/components/staff/StaffTableRow.tsx",
    ].sort();

    const matchingFiles = [
      ...collectSourceFiles(resolve(process.cwd(), "src/app")),
      ...collectSourceFiles(resolve(process.cwd(), "src/components")),
    ]
      .filter((file) =>
        /var\(--color-control-primary\)|var\(--color-control-active/.test(
          readFileSync(file, "utf-8"),
        ),
      )
      .map((file) => relative(process.cwd(), file))
      .sort();

    expect(matchingFiles).toEqual(allowedFiles);
  });
});
