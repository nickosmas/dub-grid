import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveMigration(fileName: string) {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, "supabase/migrations", fileName);
  if (existsSync(workspacePath)) return workspacePath;
  return resolve(cwd, "../../supabase/migrations", fileName);
}

describe("gridmaster account SQL boundaries", () => {
  const sql = readFileSync(resolveMigration("002_functions_triggers.sql"), "utf8");

  it("keeps gridmaster accounts out of org-user RPCs and tenant counts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()");
    expect(sql).toContain("COALESCE(p.platform_role, 'none'::public.platform_role) <> 'gridmaster'::public.platform_role");
    expect(sql).toContain("AND p.platform_role <> 'gridmaster'");
    expect(sql).toContain("JOIN public.profiles p ON p.id = om.user_id");
  });

  it("guards gridmaster demotion and deactivation against self-change and last-active removal", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.demote_gridmaster_account");
    expect(sql).toContain("Cannot demote your own gridmaster account");
    expect(sql).toContain("Cannot remove the last active gridmaster account");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_gridmaster_account_deactivated");
    expect(sql).toContain("Cannot change activation for your own gridmaster account");
    expect(sql).toContain("Cannot deactivate the last active gridmaster account");
  });

  it("promotes non-destructively by archiving memberships and forcing a claim refresh", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.promote_gridmaster_by_email");
    expect(sql).toContain("public.promote_gridmaster_by_email(p_email)");
    expect(sql).toContain("UPDATE public.organization_memberships");
    expect(sql).toContain("archived_at = COALESCE(archived_at, NOW())");
    expect(sql).toContain("org_id = NULL");
    expect(sql).toContain("reason = 'gridmaster_promotion'");
  });
});
