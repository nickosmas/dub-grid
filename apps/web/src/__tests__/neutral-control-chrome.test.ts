import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { relative, resolve } from "path";

import { buttonVariants } from "@/components/ui/button";

function resolveRepoRoot(): string {
  const cwd = process.cwd();

  if (existsSync(resolve(cwd, "apps/web/src"))) {
    return cwd;
  }

  return resolve(cwd, "../..");
}

function resolveWebSource(path: string): string {
  return resolve(resolveRepoRoot(), "apps/web/src", path);
}

const globalsCss = readFileSync(resolveWebSource("app/globals.css"), "utf-8");
const settingsShell = readFileSync(
  resolveWebSource("components/settings/SettingsShell.tsx"),
  "utf-8",
);
const gridmasterPortal = readFileSync(
  resolveWebSource("components/gridmaster/GridmasterPortal.tsx"),
  "utf-8",
);
const staffView = readFileSync(resolveWebSource("components/StaffView.tsx"), "utf-8");
const membersSection = readFileSync(
  resolveWebSource("components/staff/MembersSection.tsx"),
  "utf-8",
);
const jobsSettings = readFileSync(resolveWebSource("components/settings/Jobs.tsx"), "utf-8");
const toolbar = readFileSync(resolveWebSource("components/Toolbar.tsx"), "utf-8");
const dashboardHeader = readFileSync(
  resolveWebSource("components/dashboard/DashboardHeader.tsx"),
  "utf-8",
);
const printOptionsModal = readFileSync(
  resolveWebSource("components/PrintOptionsModal.tsx"),
  "utf-8",
);
const repeatForm = readFileSync(resolveWebSource("components/RepeatForm.tsx"), "utf-8");
const shiftPicker = readFileSync(resolveWebSource("components/ShiftPicker.tsx"), "utf-8");
const staffDetailPage = readFileSync(
  resolveWebSource("components/staff-detail/StaffDetailPage.tsx"),
  "utf-8",
);
const cardPrimitive = readFileSync(resolveWebSource("components/ui/card.tsx"), "utf-8");
const inputPrimitive = readFileSync(resolveWebSource("components/ui/input.tsx"), "utf-8");
const sidebarPrimitive = readFileSync(resolveWebSource("components/ui/sidebar.tsx"), "utf-8");
const tooltipPrimitive = readFileSync(resolveWebSource("components/ui/tooltip.tsx"), "utf-8");
const skeletonPrimitive = readFileSync(resolveWebSource("components/ui/skeleton.tsx"), "utf-8");
const appToaster = readFileSync(resolveWebSource("components/AppToaster.tsx"), "utf-8");
const repoRoot = resolveRepoRoot();

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
    expect(buttonVariants({ variant: "default" })).toContain("bg-[var(--dg-color-brand)]");
    expect(buttonVariants({ variant: "default" })).toContain(
      "hover:bg-[var(--dg-color-brand-light)]",
    );
    expect(buttonVariants({ variant: "default" })).toContain("sm:h-[var(--dg-btn-h)]");
  });

  it("exposes an explicit blue brand button variant", () => {
    expect(buttonVariants({ variant: "brand" })).toContain("bg-[var(--dg-color-brand)]");
  });

  it("defines the neutral control token ramp in the global stylesheet", () => {
    expect(globalsCss).toContain("--color-control-primary: var(--dg-color-control-primary);");
    expect(globalsCss).toContain("--color-control-active-bg: var(--dg-color-control-active-bg);");
    expect(globalsCss).toContain(
      "--color-control-active-border: var(--dg-color-control-active-border);",
    );
    expect(globalsCss).toContain("--dg-btn-radius: 6px;");
    expect(globalsCss).toContain("--dg-btn-h: 38px;");
    expect(globalsCss).toContain("--dg-toolbar-h: 38px;");
    expect(globalsCss).toContain("--dg-radius-sm: 6px;");
    expect(globalsCss).toContain("--dg-radius-md: 8px;");
    expect(globalsCss).toContain("--dg-radius-lg: 10px;");
    expect(globalsCss).toContain("--dg-radius-xl: 12px;");
    expect(globalsCss).toContain("--dg-tab-shell-radius: var(--dg-radius-md);");
    expect(globalsCss).toContain("--dg-tab-shell-pad: 2px;");
    expect(globalsCss).toContain(
      "--dg-tab-inner-radius: calc(var(--dg-tab-shell-radius) - var(--dg-tab-shell-pad));",
    );
    expect(globalsCss).toContain(".dg-btn-warning-filled");
  });

  it("maps compact and filled button variants to the shared button tokens", () => {
    expect(buttonVariants({ size: "sm" })).toContain("sm:h-[var(--dg-btn-h-sm)]");
    expect(buttonVariants({ size: "sm" })).toContain("px-[var(--dg-btn-px-sm)]");
    expect(buttonVariants({ variant: "warningFilled" })).toContain("bg-[var(--dg-color-warning)]");
    expect(buttonVariants({ variant: "dangerFilled" })).toContain("bg-[var(--dg-color-danger)]");
  });

  it("uses the shared toolbar height and radius for tabs and toolbar controls", () => {
    expect(globalsCss).toMatch(
      /\.dg-span-tabs\s*\{[\s\S]*height: var\(--dg-toolbar-h\);[\s\S]*border-radius: var\(--dg-tab-shell-radius\);[\s\S]*\}/,
    );
    expect(globalsCss).toMatch(
      /\.dg-span-tab\s*\{[\s\S]*border-radius: var\(--dg-tab-inner-radius\);[\s\S]*\}/,
    );
    expect(globalsCss).toMatch(
      /\.dg-span-tabs--light \.dg-span-tab\s*\{[\s\S]*border-radius: var\(--dg-tab-inner-radius\);[\s\S]*\}/,
    );
    expect(globalsCss).toMatch(
      /\.dg-nav-tab\s*\{[\s\S]*min-height: var\(--dg-toolbar-h\);[\s\S]*border-radius: var\(--dg-btn-radius\);[\s\S]*\}/,
    );
    expect(globalsCss).toMatch(/\.dg-scroll-inner\s*\{[\s\S]*height: 100%;[\s\S]*\}/);
  });

  it("maps shared surface primitives onto the radius tokens", () => {
    expect(cardPrimitive).toContain("rounded-[var(--dg-radius-md)]");
    expect(inputPrimitive).toContain("rounded-[var(--dg-btn-radius)]");
    expect(sidebarPrimitive).toContain("rounded-[var(--dg-radius-lg)]");
    expect(tooltipPrimitive).toContain("rounded-[var(--tooltip-border-radius)]");
    expect(skeletonPrimitive).toContain("rounded-[var(--dg-radius-sm)]");
    expect(appToaster).toContain("rounded-[var(--dg-radius-lg)]");
  });

  it("routes current inset tab consumers through the shared shell classes", () => {
    for (const source of [
      dashboardHeader,
      printOptionsModal,
      repeatForm,
      shiftPicker,
      staffDetailPage,
      membersSection,
      toolbar,
    ]) {
      expect(source).toContain("dg-span-tabs");
      expect(source).toContain("dg-span-tab");
    }
  });

  it("uses the neutral highlight token for shared active navigation chrome", () => {
    const activeNavTab = globalsCss.match(/\.dg-nav-tab\.active\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    // Gray background + near-black text, not brand blue — see `navActiveBg`
    // in @dubgrid/design-tokens.
    expect(activeNavTab).toContain("background: var(--dg-color-nav-active-bg);");
    expect(activeNavTab).toContain("color: var(--dg-color-text-primary);");
    // Highlighting is background + color only — the active tab has no border.
    expect(activeNavTab).not.toMatch(/border/);
  });

  it("uses the navbar-link highlight recipe for app sidebars", () => {
    // SettingsPage delegates its sidebar chrome to SettingsShell, so the
    // highlight recipe lives on the shell now.
    for (const source of [settingsShell, gridmasterPortal, staffView]) {
      expect(source).toContain("data-[active=true]:bg-[var(--dg-color-nav-active-bg)]");
      expect(source).toContain("data-[active=true]:text-[var(--dg-color-text-primary)]");
      // No border/ring on the active item, matching the navbar tabs.
      expect(source).not.toMatch(/data-\[active=true\]:ring-/);
      // Active sidebar chrome is fully neutral: the icon wrapper follows the
      // label rather than being tinted brand blue.
      expect(source).not.toMatch(/text-\[var\(--dg-color-brand\)\]/);
    }
  });

  it("keeps the sidebar menu button's active state borderless", () => {
    // focus-visible:ring-2 must stay — that is the keyboard focus indicator,
    // not the active highlight.
    expect(sidebarPrimitive).not.toMatch(/data-active:ring-/);
    expect(sidebarPrimitive).toContain("focus-visible:ring-2");
  });

  it("keeps audited primary buttons and selectors on theme blue", () => {
    expect(jobsSettings).toContain('className="dg-btn dg-btn-primary dg-btn-sm"');
    expect(jobsSettings).toContain('className="dg-btn dg-btn-secondary dg-btn-sm"');
    expect(toolbar).toContain('background: toolsOpen ? "var(--dg-color-brand-bg)" : undefined');
    expect(toolbar).toContain('color: toolsOpen ? "var(--dg-color-brand)" : undefined');
    expect(globalsCss).toMatch(
      /\.dg-checkbox:checked\s*\{[\s\S]*background: var\(--dg-color-brand\);[\s\S]*border-color: var\(--dg-color-brand\);[\s\S]*\}/,
    );
  });

  it("limits neutral control tokens to structural row and drag chrome", () => {
    const allowedFiles = [
      "apps/web/src/app/globals.css",
      "apps/web/src/components/staff/MembersSection.tsx",
      "apps/web/src/components/staff/StaffContextBar.tsx",
      "apps/web/src/components/staff/StaffTableRow.tsx",
    ].sort();

    const matchingFiles = [
      ...collectSourceFiles(resolveWebSource("app")),
      ...collectSourceFiles(resolveWebSource("components")),
    ]
      .filter((file) =>
        /var\(--dg-color-control-primary\)|var\(--dg-color-control-active/.test(
          readFileSync(file, "utf-8"),
        ),
      )
      .map((file) => relative(repoRoot, file))
      .sort();

    expect(matchingFiles).toEqual(allowedFiles);
  });
});
