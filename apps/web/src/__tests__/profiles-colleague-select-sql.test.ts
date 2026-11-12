import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

describe("a colleague's account is for the people who act on it (migration 133)", () => {
  const migration = readFileSync(migrationPath("133_colleague_accounts_server_owned.sql"), "utf8");
  const policy = migration.slice(migration.indexOf("CREATE POLICY org_member_profiles_select"));

  it("replaces the policy that let any member read every profile in their organization", () => {
    expect(migration).toContain(
      "DROP POLICY IF EXISTS org_member_profiles_select ON public.profiles;",
    );
    expect(migration.indexOf("DROP POLICY")).toBeLessThan(migration.indexOf("CREATE POLICY"));
  });

  it("keeps it to Admins and Super Admins of the caller's organization", () => {
    expect(policy).toContain("FOR SELECT TO authenticated");
    expect(policy).toContain("org_id = public.caller_org_id()");
    expect(policy).toContain("public.caller_org_role() IN ('admin', 'super_admin')");
  });

  it("changes no grant", () => {
    expect(migration).not.toMatch(/\b(GRANT|REVOKE)\b/);
  });
});
