import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function policyText(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"`);
  if (start < 0) throw new Error(`Missing policy: ${name}`);
  return sql.slice(start, sql.indexOf("\n  );", start));
}

describe("draft schedule state is editor-only (migration 035)", () => {
  const migration = readFileSync(migrationPath("035_draft_state_editor_only.sql"), "utf8");

  it("restates the three member read policies with a published-only clause for non-editors", () => {
    for (const name of [
      "members_select_schedule_cell_snapshots",
      "members_select_schedule_cell_segments",
      "members_select_notes",
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${name}"`);
      expect(policyText(migration, name)).toMatch(/FOR SELECT TO authenticated/);
      expect(policyText(migration, name)).toContain("org_id = public.caller_org_id()");
    }
    expect(policyText(migration, "members_select_schedule_cell_snapshots")).toMatch(
      /snapshot_kind = 'published'\s+OR public\.check_admin_permission\('canEditShifts'\)/,
    );
    expect(policyText(migration, "members_select_schedule_cell_segments")).toMatch(
      /snapshot\.snapshot_kind = 'published'/,
    );
    expect(policyText(migration, "members_select_notes")).toMatch(
      /status <> 'draft'\s+OR public\.check_admin_permission\('canEditShifts'\)\s+OR public\.check_admin_permission\('canEditNotes'\)/,
    );
  });

  it("scopes the editor draft topic to editors on both receive and send", () => {
    for (const name of [
      "schedule_editors_receive_draft_realtime",
      "schedule_editors_send_draft_realtime",
    ]) {
      const policy = policyText(migration, name);
      expect(policy).toContain("ON realtime.messages");
      expect(policy).toContain(`'schedule:' || organization.id::TEXT || ':drafts'`);
      expect(policy).toMatch(/caller_org_role\(\) = 'super_admin'/);
      expect(policy).toMatch(/check_admin_permission\('canEditShifts'\)/);
      expect(policy).toMatch(/check_admin_permission\('canEditNotes'\)/);
      expect(policy).toContain("public.is_own_sandbox_org(organization.id)");
    }
    expect(migration).not.toContain(`"schedule_members_receive_realtime"`);
  });
});
