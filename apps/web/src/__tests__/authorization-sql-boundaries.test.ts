import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticatedSecurityDefinerAllowlist } from "./helpers/sql-inventory";

function supabaseRoot(): string {
  const fromRoot = resolve(process.cwd(), "supabase");
  return existsSync(fromRoot) ? fromRoot : resolve(process.cwd(), "../../supabase");
}

const expectedAuthenticatedSecurityDefiners = [
  "accept_invitation",
  "assign_org_role_by_email",
  "auto_approve_shift_request",
  "caller_org_id",
  "caller_org_role",
  "cancel_shift_request",
  "change_user_role",
  "check_admin_permission",
  "claim_shift_request",
  "complete_onboarding",
  "create_shift_request",
  "create_shift_series",
  "delete_schedule_cell_draft",
  "delete_shift_series",
  "demote_gridmaster_account",
  "end_impersonation",
  "force_logout_user",
  "get_all_users_with_profiles",
  "get_audit_log",
  "get_gridmaster_accounts",
  "get_impersonation_history",
  "get_my_organizations",
  "get_notification_facets",
  "get_notifications",
  "get_org_directory",
  "get_org_users",
  "get_publish_history",
  "get_schedule_last_viewed",
  "get_tenant_stats",
  "get_unread_notification_count",
  "gridmaster_write_allowed",
  "import_previous_schedule",
  "is_gridmaster",
  "is_own_sandbox_org",
  "mark_all_notifications_read",
  "mark_all_notifications_read_with_unread_count",
  "mark_notification_read",
  "mark_notification_read_with_unread_count",
  "move_shift",
  "mutate_notifications_with_unread_count",
  "promote_gridmaster_by_email",
  "publish_schedule",
  "remove_focus_area_from_employees",
  "resolve_shift_request",
  "respond_to_shift_request",
  "set_gridmaster_account_deactivated",
  "set_job_shift_overrides",
  "start_impersonation",
  "start_trial_for_org",
  "switch_org",
  "update_schedule_last_viewed",
  "update_series_all_shifts",
  "upsert_recurring_shift",
  "volunteer_for_open_shift",
  "write_schedule_cell_snapshot",
].sort();

describe("authorization SQL inventory", () => {
  const migrationsDir = resolve(supabaseRoot(), "migrations");
  const hardening = readFileSync(
    resolve(migrationsDir, "016_harden_authorization_boundaries.sql"),
    "utf8",
  );

  it("classifies the complete authenticated SECURITY DEFINER entry-point set", () => {
    expect(authenticatedSecurityDefinerAllowlist()).toEqual(expectedAuthenticatedSecurityDefiners);
  });

  it("removes anonymous and implicit future function execution", () => {
    expect(hardening).toContain(
      "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;",
    );
    expect(hardening).toContain("REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;");
    expect(hardening).toContain("AND procedure.prosecdef");
    expect(hardening).toContain("REVOKE EXECUTE ON FUNCTION %s FROM authenticated");
  });

  it("pins search_path on every SECURITY DEFINER definition", () => {
    for (const fileName of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(resolve(migrationsDir, fileName), "utf8");
      const starts = [...sql.matchAll(/CREATE OR REPLACE FUNCTION\s+/g)].map(
        (match) => match.index,
      );

      for (const [index, start] of starts.entries()) {
        const end = starts[index + 1] ?? sql.length;
        const definition = sql.slice(start, end);
        if (!/SECURITY\s+DEFINER/i.test(definition)) continue;

        expect(
          definition,
          `${fileName} has a SECURITY DEFINER function without a fixed public search_path`,
        ).toMatch(/SET\s+search_path\s*=\s*'?public'?/i);
      }
    }
  });

  it("ties direct JWT tenant and Gridmaster access to live session and account state", () => {
    const callerOrg = hardening.slice(hardening.indexOf("FUNCTION public.caller_org_id()"));
    const callerOrgBody = callerOrg.slice(0, callerOrg.indexOf("$$;") + 3);
    expect(callerOrgBody).toContain("membership.archived_at IS NULL");
    expect(callerOrgBody).toContain("organization.archived_at IS NULL");
    expect(callerOrgBody).toContain("organization.suspended_at IS NULL");
    expect(callerOrgBody).toContain("profile.deactivated_at IS NULL");
    expect(callerOrgBody).toContain("session.supabase_session_id = claimed.session_id");

    const gridmaster = hardening.slice(hardening.indexOf("FUNCTION public.is_gridmaster()"));
    const gridmasterBody = gridmaster.slice(0, gridmaster.indexOf("$$;") + 3);
    expect(gridmasterBody).toContain("profile.deactivated_at IS NULL");
    expect(gridmasterBody).toContain("session.supabase_session_id");
  });
});
