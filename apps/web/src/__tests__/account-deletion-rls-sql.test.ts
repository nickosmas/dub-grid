import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

describe("account deletion row-level rule (migration 031)", () => {
  const sql = readFileSync(migrationPath("031_account_deletion_super_admin_only.sql"), "utf8");

  it("replaces the admin update policy in place", () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "admin_profile_change_requests_update" ON public.profile_change_requests;',
    );
    expect(sql).toContain(
      'CREATE POLICY "admin_profile_change_requests_update"\n  ON public.profile_change_requests FOR UPDATE TO authenticated',
    );
  });

  it("keeps profile updates with people managers and deletions with super admins", () => {
    expect(sql).toContain("public.caller_org_role() = 'super_admin'");
    expect(sql).toMatch(
      /request_type = 'profile_update'\s+AND public\.check_admin_permission\('canManageEmployees'\)/,
    );
    expect(sql).not.toMatch(/OR public\.check_admin_permission\('canManageEmployees'\)/);
  });

  it("keeps the resolver stamp on every update", () => {
    expect(sql).toContain("AND resolver_user_id = auth.uid()");
    expect(sql).toContain("AND resolved_at IS NOT NULL");
  });
});
