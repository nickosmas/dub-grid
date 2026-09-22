import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function functionText(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  return sql.slice(start, sql.indexOf("\n$$;", start) + "\n$$;".length);
}

const INVITER_GUARD_ANCHOR = `  PERFORM set_config('app.allow_role_change', 'true', true);

  INSERT INTO public.organization_memberships (`;

describe("row-level trust boundaries (migration 033)", () => {
  const migration = readFileSync(migrationPath("033_row_level_trust_boundaries.sql"), "utf8");

  describe("invitation role ceiling (F-04)", () => {
    it("lets only a super admin insert a super-admin invitation", () => {
      const start = migration.indexOf('CREATE POLICY "invitations_insert"');
      const policy = migration.slice(start, migration.indexOf(");", start));
      expect(migration).toContain('DROP POLICY IF EXISTS "invitations_insert"');
      expect(policy).toMatch(
        /role_to_assign <> 'super_admin'\s+OR public\.caller_org_role\(\)::TEXT = 'super_admin'/,
      );
    });

    it("restates accept_invitation from 018 with only the inviter guard added", () => {
      const header = "CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)";
      const original = functionText(
        readFileSync(migrationPath("018_harden_invitation_acceptance.sql"), "utf8"),
        header,
      );
      const restated = functionText(migration, header);
      expect(original.split(INVITER_GUARD_ANCHOR)).toHaveLength(2);

      const guardStart = restated.indexOf("  -- A super-admin invitation is honoured only");
      const guardEnd = restated.indexOf(INVITER_GUARD_ANCHOR);
      expect(guardStart).toBeGreaterThan(0);
      expect(guardEnd).toBeGreaterThan(guardStart);
      const guard = restated.slice(guardStart, guardEnd);
      expect(guard).toContain("v_invite.role_to_assign = 'super_admin'");
      expect(guard).toContain("inviter.platform_role = 'gridmaster'");
      expect(guard).toContain("inviter.org_role = 'super_admin'");
      expect(guard).toContain("inviter.archived_at IS NULL");
      expect(guard).toContain("RAISE EXCEPTION 'INVITATION_INVALID';");

      expect(restated.slice(0, guardStart) + restated.slice(guardEnd)).toBe(original);
    });

    it("keeps the acceptance entry point available to members", () => {
      expect(migration).toContain(
        "GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;",
      );
    });
  });

  describe("profile lifecycle columns (F-05)", () => {
    it("takes the table-level update away and grants back only member-editable columns", () => {
      expect(migration).toContain("REVOKE UPDATE ON public.profiles FROM authenticated;");
      expect(migration).toMatch(
        /GRANT UPDATE \(first_name, last_name, updated_at, version, terms_accepted_at, terms_version\)\s+ON public\.profiles TO authenticated;/,
      );
      for (const column of [
        "platform_role",
        "deactivated_at",
        "terminated_at",
        "scheduled_deletion_at",
        "mfa_enabled",
        "role_locked",
      ]) {
        expect(migration).not.toMatch(new RegExp(`GRANT UPDATE \\([^)]*${column}`));
      }
    });
  });

  describe("terms columns are server-owned (F-21, migration 034)", () => {
    const followUp = readFileSync(migrationPath("034_terms_columns_server_owned.sql"), "utf8");

    it("regrants the member columns without the terms pair", () => {
      expect(followUp).toContain("REVOKE UPDATE ON public.profiles FROM authenticated;");
      expect(followUp).toMatch(
        /GRANT UPDATE \(first_name, last_name, updated_at, version\)\s+ON public\.profiles TO authenticated;/,
      );
      expect(followUp).not.toMatch(/GRANT UPDATE \([^)]*terms_/);
    });
  });

  describe("session rows (F-06)", () => {
    it("leaves members a read-only view of their own sessions", () => {
      expect(migration).toContain(
        'DROP POLICY IF EXISTS "own_sessions_only" ON public.user_sessions;',
      );
      expect(migration).toMatch(
        /CREATE POLICY "own_sessions_select"\s+ON public\.user_sessions FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\)\);/,
      );
      expect(migration).not.toMatch(/user_sessions FOR (ALL|INSERT|UPDATE|DELETE)/);
    });
  });
});
