import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

describe("a colleague's account is server-owned (migration 133)", () => {
  const migration = readFileSync(migrationPath("133_colleague_accounts_server_owned.sql"), "utf8");

  it("drops the policy that let any member read every profile in their organization", () => {
    expect(migration).toContain(
      "DROP POLICY IF EXISTS org_member_profiles_select ON public.profiles;",
    );
  });

  it("leaves the caller's own row and every other policy alone", () => {
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toMatch(/\b(GRANT|REVOKE)\b/);
    expect(migration.match(/DROP POLICY/g)).toHaveLength(1);
  });
});
