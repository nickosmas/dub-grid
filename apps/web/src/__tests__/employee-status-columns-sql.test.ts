import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

describe("a colleague's status columns are server-owned (migration 132)", () => {
  const migration = readFileSync(migrationPath("132_colleague_status_server_owned.sql"), "utf8");

  it("takes status, when it changed and offboarding away from members", () => {
    expect(migration).toContain(
      "REVOKE SELECT (status, status_changed_at, archived_at) ON public.employees FROM authenticated;",
    );
  });

  it("grants nothing back and leaves the row policies alone", () => {
    expect(migration).not.toMatch(/\bGRANT\b/);
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("DROP POLICY");
  });
});
