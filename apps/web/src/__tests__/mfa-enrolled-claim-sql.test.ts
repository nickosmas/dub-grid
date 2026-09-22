import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

const HOOK_HEADER = "CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)";

function hookText(sql: string): string {
  const start = sql.indexOf(HOOK_HEADER);
  if (start < 0) throw new Error("Missing the access token hook");
  return sql.slice(start, sql.indexOf("\n$$;", start) + "\n$$;".length);
}

const MFA_HUNK = `  -- Audit finding F-07: a verified TOTP factor is only known to the auth
  -- schema, so every other layer had to trust the client or pay a round trip
  -- to find out. Recomputed on every mint and refresh, so enrolling or
  -- unenrolling self-heals on the next token rather than stranding anyone.
  claims := jsonb_set(
    claims,
    '{mfa_enrolled}',
    to_jsonb(EXISTS (
      SELECT 1
      FROM auth.mfa_factors AS factor
      WHERE factor.user_id = uid
        AND factor.factor_type = 'totp'
        AND factor.status = 'verified'
    ))
  );

`;

const FOUND_ANCHOR = `  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(COALESCE(user_profile.platform_role, 'none')));`;

describe("mfa_enrolled claim (migration 037)", () => {
  const previous = hookText(
    readFileSync(migrationPath("021_platform_account_termination.sql"), "utf8"),
  );
  const migration = readFileSync(migrationPath("037_mfa_enrolled_claim.sql"), "utf8");
  const current = hookText(migration);

  it("restates the hook from 021 with only the claim hunk added", () => {
    expect(previous.split(FOUND_ANCHOR)).toHaveLength(2);
    expect(previous.replace(FOUND_ANCHOR, MFA_HUNK + FOUND_ANCHOR)).toBe(current);
  });

  it("reads the factor from the auth schema, which the hook's search_path does not cover", () => {
    expect(current).toContain("FROM auth.mfa_factors AS factor");
    expect(current).toContain("SET search_path = 'public'");
    // profiles.mfa_enabled is client-written and must never be the source.
    expect(current).not.toContain("mfa_enabled");
  });

  it("keeps the hook's ownership and grants", () => {
    expect(migration).toContain(
      "ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;",
    );
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb)");
  });
});
