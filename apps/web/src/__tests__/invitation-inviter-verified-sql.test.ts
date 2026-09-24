import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function functionText(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  return sql.slice(start, sql.indexOf("\n$$;", start) + "\n$$;".length);
}

describe("invitation inviter verification (migration 043)", () => {
  const migration = readFileSync(migrationPath("043_invitation_inviter_is_verified.sql"), "utf8");

  it("applies the acceptance-time tier rule to whoever is named as inviter", () => {
    const helper = functionText(migration, "CREATE OR REPLACE FUNCTION public.inviter_may_grant(");
    // A gridmaster may grant any tier; an org member may grant super_admin only
    // while holding it, and must hold a live membership either way.
    expect(helper).toMatch(/platform_role = 'gridmaster'/);
    expect(helper).toMatch(/inviter\.archived_at IS NULL/);
    expect(helper).toMatch(/p_role <> 'super_admin' OR inviter\.org_role = 'super_admin'/);
    // A missing inviter can never grant, so the check fails closed.
    expect(helper).toMatch(/p_inviter IS NOT NULL/);
  });

  it("keeps the helper off the authenticated role's reachable surface", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.inviter_may_grant(UUID, UUID, TEXT) FROM PUBLIC;",
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.inviter_may_grant[^;]*TO[^;]*authenticated/,
    );
  });

  it("records a verified inviter on send_invitation rather than auth.uid()", () => {
    const fn = functionText(migration, "CREATE OR REPLACE FUNCTION public.send_invitation(");
    expect(fn).toMatch(/p_invited_by\s+UUID DEFAULT NULL/);
    expect(fn).toMatch(/v_inviter := COALESCE\(p_invited_by, auth\.uid\(\)\)/);
    expect(fn).toMatch(/IF NOT public\.inviter_may_grant\(v_inviter, p_org_id, p_role\)/);
    expect(fn).toContain("VALUES (p_org_id, v_inviter, lower(p_email)");
    // The old form recorded auth.uid(), which is NULL on the service-role path.
    expect(fn).not.toContain("VALUES (p_org_id, auth.uid()");
  });

  it("drops the nine-argument form so no caller can omit the inviter", () => {
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.send_invitation(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BIGINT[], BIGINT[]);",
    );
  });

  it("checks the inviter the replace path is handed, before it writes", () => {
    const fn = functionText(
      migration,
      "CREATE OR REPLACE FUNCTION public.replace_pending_invitation_access(",
    );
    expect(fn).toMatch(
      /IF NOT public\.inviter_may_grant\(\s*COALESCE\(p_invited_by, v_current\.invited_by\), p_org_id, p_role\s*\)/,
    );
    // The guard must precede the revoke, so a refusal leaves the row pending.
    expect(fn.indexOf("inviter_may_grant")).toBeLessThan(fn.indexOf("SET revoked_at = NOW()"));
  });

  it("adds no invitations UPDATE policy, which would widen what an admin may write", () => {
    // invitations_revoke already limits an authenticated caller to updates that
    // leave the row revoked, which is stricter than a tier ceiling.
    expect(migration).not.toMatch(/CREATE POLICY "invitations_update"/);
  });
});
