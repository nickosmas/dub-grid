import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveSupabaseFile(relativePath: string) {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, "supabase", relativePath);
  if (existsSync(workspacePath)) return workspacePath;
  return resolve(cwd, "../../supabase", relativePath);
}

function resolveMigration(fileName: string) {
  return resolveSupabaseFile(`migrations/${fileName}`);
}

/**
 * The tenancy boundary, pinned at the SQL level.
 *
 * Each case below is a cross-tenant leak that existed and was fixed. They are
 * asserted against the migration text rather than a live database because these
 * are the definitions a fresh `db:reset` produces, and because every one of them
 * failed silently in production: nothing errored, the wrong rows were simply
 * readable. See supabase/patches/2026-08-org-isolation.sql for the statements
 * that carry these to an already-provisioned database.
 */
describe("org isolation SQL boundaries", () => {
  const functions = readFileSync(resolveMigration("002_functions_triggers.sql"), "utf8");
  const membershipGuard = readFileSync(resolveMigration("005_live_membership_guard.sql"), "utf8");
  const grants = readFileSync(resolveMigration("004_grants.sql"), "utf8");

  // Every org-scoped RLS policy is `USING (org_id = public.caller_org_id())`.
  // A stale JWT claim must therefore be tied to a current, unarchived
  // membership rather than trusted on its own.
  it("requires a current membership for the JWT org claim, with no profiles fallback", () => {
    const definition = membershipGuard.slice(
      membershipGuard.indexOf("CREATE OR REPLACE FUNCTION public.caller_org_id()"),
    );
    const body = definition.slice(0, definition.indexOf("$$;") + 3);

    expect(body).toContain("NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id");
    expect(body).toContain("FROM public.organization_memberships AS membership");
    expect(body).toContain("membership.user_id = auth.uid()");
    expect(body).toContain("membership.org_id = claimed.org_id");
    expect(body).toContain("membership.archived_at IS NULL");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("COALESCE");
  });

  // "Remove from organization" is a soft archive everywhere in the app, so the
  // AFTER DELETE trigger never fired for a real removal: profiles.org_id stayed
  // pointed at the org, and no refresh lock was written, leaving the already
  // minted token's org_id + org_role usable until it expired.
  it("tears down org context when a membership is archived, not only when deleted", () => {
    expect(functions).toContain("CREATE OR REPLACE FUNCTION public.on_membership_archived()");
    expect(functions).toContain("CREATE TRIGGER trg_membership_archived");
    expect(functions).toContain("AFTER UPDATE OF archived_at ON public.organization_memberships");
    expect(functions).toContain("WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)");

    const trigger = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION public.on_membership_archived()"),
    );
    const body = trigger.slice(0, trigger.indexOf("$$;") + 3);
    expect(body).toContain("SET org_id = NULL");
    expect(body).toContain("'membership_removed'");
  });

  // is_active drove the mobile login flow's decision to skip switch_org
  // entirely. Sourced from profiles.org_id — a global that switch_org rewrites
  // on every device — it reported another device's switch as this device's
  // current org, and the app rendered one org's identity over another's data.
  it("computes get_my_organizations.is_active from the calling session", () => {
    const definition = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION public.get_my_organizations()"),
    );
    const body = definition.slice(0, definition.indexOf("$$;") + 3);

    expect(body).toContain("auth.jwt() ->> 'session_id'");
    expect(body).toContain("FROM public.user_sessions s");
    expect(body).toContain("WHERE s.supabase_session_id = v_session_id");
    expect(body).toContain("AND s.user_id = v_uid");
  });

  // The archive teardown reads profiles.org_id, then nulls it. Both the null-out
  // and the refresh lock key off that read, so it has to be captured first —
  // re-querying after the UPDATE always sees false and the lock never fires.
  it("captures the profile default before nulling it", () => {
    const trigger = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION public.on_membership_archived()"),
    );
    const body = trigger.slice(0, trigger.indexOf("$$;") + 3);

    expect(body).toContain("v_was_default := EXISTS (");
    expect(body.indexOf("v_was_default :=")).toBeLessThan(body.indexOf("SET org_id = NULL"));
    expect(body).toContain("IF v_was_default OR EXISTS (");

    // Scoped, not unconditional: the lock is per user, so it 403s every device
    // they own. It must only fire when a token can still be claiming this org.
    expect(body).toContain("WHERE user_id = NEW.user_id AND active_org_id = NEW.org_id");
  });

  // Never granted to authenticated: SECURITY DEFINER with a raw p_org_id and no
  // RLS, so a direct RPC read any org's cells given the UUIDs. Revoked rather
  // than guarded internally — ~23 SQL functions call it, and a failing internal
  // guard returns zero rows instead of an error, which would look like data loss
  // rather than a permission problem.
  it("revokes get_schedule_cell_snapshot_payload instead of guarding it inline", () => {
    const definition = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION public.get_schedule_cell_snapshot_payload("),
    );
    const body = definition.slice(0, definition.indexOf("$$;") + 3);

    expect(body).not.toContain("caller_org_id()");
    expect(functions).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT) TO authenticated;",
    );
  });

  // 004 ends with a blanket `GRANT EXECUTE ON ALL FUNCTIONS ... TO
  // authenticated`, which silently undid 002's REVOKE on the access-token hook.
  // Reachable over PostgREST, that hook returned any user's minted claims for
  // an attacker-supplied user_id — a cross-tenant membership oracle — and wrote
  // user_sessions and profiles rows for them.
  it("revokes the internal SECURITY DEFINER functions AFTER the blanket grant", () => {
    const blanketGrant = grants.indexOf("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public");
    expect(blanketGrant).toBeGreaterThan(-1);

    for (const revoked of [
      "REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)",
      "REVOKE EXECUTE ON FUNCTION public.sync_schedule_cell_snapshot(",
      "REVOKE EXECUTE ON FUNCTION public.prune_empty_schedule_cell(UUID)",
      "REVOKE EXECUTE ON FUNCTION public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT)",
    ]) {
      const at = grants.indexOf(revoked);
      expect(at, `${revoked} is missing from 004_grants.sql`).toBeGreaterThan(-1);
      expect(at, `${revoked} must come after the blanket grant, or it is undone`).toBeGreaterThan(
        blanketGrant,
      );
    }

    // Revoked from users, still callable by the two roles that need it.
    expect(grants).toContain(
      "GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;",
    );
    expect(grants).toContain(
      "GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;",
    );
  });

  // The migrations only take effect on a full db:reset, so the live database is
  // patched from this file instead. If it drifts from the migrations, a reset
  // and a patched database stop agreeing — and the difference is invisible
  // until someone reads the wrong org's rows.
  it("keeps the live-database patch in step with the migrations", () => {
    const patch = readFileSync(resolveSupabaseFile("patches/2026-08-org-isolation.sql"), "utf8");

    // Same definitions, not a description of them: this file must be runnable
    // on its own, with nothing left to copy by hand.
    expect(patch).toContain("NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id");
    expect(patch).toContain("FROM public.organization_memberships AS membership");
    expect(patch).toContain("membership.archived_at IS NULL");
    expect(patch).toContain("CREATE TRIGGER trg_membership_archived");
    expect(patch).toContain("WHERE s.supabase_session_id = v_session_id");
    expect(patch).toContain("IF v_was_default OR EXISTS (");

    // Every revoke the migrations make, the patch has to make too, or a patched
    // database keeps handing out what a reset one does not.
    for (const revoked of [
      "public.custom_access_token_hook(jsonb)",
      "public.sync_schedule_cell_snapshot(",
      "public.prune_empty_schedule_cell(UUID)",
      "public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT)",
    ]) {
      expect(patch, `${revoked} is not revoked in the patch`).toContain(
        `REVOKE EXECUTE ON FUNCTION ${revoked}`,
      );
    }

    // And the revokes still come last, for the same reason they do in 004: a
    // grant after them reopens everything.
    expect(patch.indexOf("REVOKE EXECUTE ON FUNCTION")).toBeGreaterThan(
      patch.lastIndexOf("GRANT EXECUTE ON FUNCTION public.get_my_organizations()"),
    );
  });

  // The last blanket grant in the file has to precede the revokes above;
  // re-granting after them would reopen everything with no visible symptom.
  it("adds no blanket function grant after the revokes", () => {
    const lastBlanketGrant = grants.lastIndexOf("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public");
    const lastDefaultPrivilege = grants.lastIndexOf("GRANT EXECUTE ON FUNCTIONS TO authenticated");
    const firstRevoke = grants.indexOf("REVOKE EXECUTE ON FUNCTION");

    expect(firstRevoke).toBeGreaterThan(lastBlanketGrant);
    expect(firstRevoke).toBeGreaterThan(lastDefaultPrivilege);
  });
});
