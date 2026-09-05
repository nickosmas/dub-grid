import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const readMigration = (name: string) =>
  readFileSync(path.join(repoRoot, "supabase", "migrations", name), "utf8");
const readRepoFile = (name: string) => readFileSync(path.join(repoRoot, name), "utf8");

describe("schedule editor termination ledger", () => {
  it("exists in the canonical schema with owner and organization constraints", () => {
    const schema = readMigration("001_schema.sql");

    expect(schema).toContain("CREATE TABLE public.schedule_editor_session_terminations");
    expect(schema).toContain("UNIQUE (org_id, user_id, editor_session_id)");
    expect(schema).toContain("schedule_editor_termination_not_self");
    expect(schema).toContain(
      "schedule_editor_terminations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
    );
  });

  it("allows only owner-scoped reads and inserts for schedule editors", () => {
    const policies = readMigration("003_rls_policies.sql");
    const grants = readMigration("004_grants.sql");

    expect(policies).toContain(
      "ALTER TABLE public.schedule_editor_session_terminations ENABLE ROW LEVEL SECURITY",
    );
    expect(policies).toContain("user_id = auth.uid()");
    expect(policies).toContain("org_id = public.caller_org_id()");
    expect(policies).toContain("public.check_admin_permission('canEditNotes')");
    expect(policies).toContain("organization.suspended_at IS NULL");
    expect(grants).toContain(
      "REVOKE UPDATE, DELETE ON TABLE public.schedule_editor_session_terminations FROM authenticated",
    );
  });

  it("provides an idempotent forward migration for existing databases", () => {
    const migration = readMigration("013_schedule_editor_sessions.sql");

    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.schedule_editor_session_terminations",
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "users_select_own_schedule_editor_terminations"',
    );
    expect(migration).toContain(
      "GRANT ALL ON TABLE public.schedule_editor_session_terminations TO service_role",
    );
  });

  it("protects private schedule broadcast and presence by live organization context", () => {
    for (const sql of [
      readMigration("003_rls_policies.sql"),
      readMigration("013_schedule_editor_sessions.sql"),
    ]) {
      expect(sql).toContain('DROP POLICY IF EXISTS "schedule_members_receive_realtime"');
      expect(sql).toContain('DROP POLICY IF EXISTS "schedule_editors_send_realtime"');
      expect(sql).toContain("ON realtime.messages FOR SELECT TO authenticated");
      expect(sql).toContain("ON realtime.messages FOR INSERT TO authenticated");
      expect(sql).toContain("realtime.messages.extension IN ('broadcast', 'presence')");
      expect(sql).toContain("(SELECT realtime.topic()) = 'schedule:' || organization.id::TEXT");
      expect(sql).toContain("organization.id = public.caller_org_id()");
      expect(sql).toContain("organization.archived_at IS NULL");
      expect(sql).toContain("organization.suspended_at IS NULL");
      expect(sql).toContain("public.is_own_sandbox_org(organization.id)");
    }
  });

  it("makes the remote reset discover every numbered migration", () => {
    const resetScript = readRepoFile("scripts/reset-remote-db.ts");

    expect(resetScript).toContain('const migrationsDirectory = "supabase/migrations"');
    expect(resetScript).toContain("readdirSync(migrationsDirectory)");
    expect(resetScript).toContain("/^\\d{3}_[a-z0-9_]+\\.sql$/");
    expect(resetScript).toContain(".sort()");
    expect(resetScript).toContain("if (migrations.length === 0)");
    expect(resetScript).not.toContain('"supabase/migrations/004_grants.sql",');
  });

  it("does not alter the legacy schedule draft-session table in migration 013", () => {
    expect(readMigration("013_schedule_editor_sessions.sql")).not.toContain(
      "schedule_draft_sessions",
    );
  });
});
