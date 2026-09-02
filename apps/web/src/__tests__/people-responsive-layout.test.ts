import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webSrc = existsSync(path.resolve(process.cwd(), "apps/web/src"))
  ? path.resolve(process.cwd(), "apps/web/src")
  : path.resolve(process.cwd(), "src");

describe("People responsive layout", () => {
  it("keeps every primary toolbar control reachable without an outer scroller", () => {
    const members = readFileSync(
      path.join(webSrc, "components", "staff", "MembersSection.tsx"),
      "utf8",
    );

    expect(members).toContain('data-testid="people-toolbar"');
    expect(members).toContain('className="dg-toolbar-type"');
    expect(members).toContain(
      '{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }',
    );
    expect(members).toContain('flex: isMobile ? "1 1 160px" : "1 1 300px"');
    expect(members).toContain("<ScrollableTabs");
    expect(members).not.toMatch(/data-testid="people-toolbar"[\s\S]{0,180}overflow-x-auto/);
  });

  it("keeps all People columns in stable-width horizontal tables", () => {
    const members = readFileSync(
      path.join(webSrc, "components", "staff", "MembersSection.tsx"),
      "utf8",
    );
    const rows = readFileSync(
      path.join(webSrc, "components", "staff", "StaffTableRow.tsx"),
      "utf8",
    );

    expect(members).toContain("min-w-[1280px]");
    expect(members).toContain('Table className="min-w-[900px]"');
    expect(members.match(/showScrollCues/g)).toHaveLength(2);
    expect(members).not.toMatch(/<TableHead className="hidden[^\n]+(?:md|lg):table-cell/);
    expect(rows).not.toMatch(/(?:tableClassName|gridClassName)="[^"]*\bhidden\b/);
  });
});
