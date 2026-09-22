import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function functionText(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function: ${header}`);
  return sql.slice(start, sql.indexOf("\n$$;", start) + "\n$$;".length);
}

const GUARD = "AND NOT public.caller_mfa_challenge_pending()";

describe("MFA enforced in the policy helpers (migration 038)", () => {
  const previous = readFileSync(migrationPath("016_harden_authorization_boundaries.sql"), "utf8");
  const migration = readFileSync(migrationPath("038_mfa_enforced_in_policies.sql"), "utf8");

  it("reads both halves of the decision from the token, so no query can stall it", () => {
    const helper = functionText(
      migration,
      "CREATE OR REPLACE FUNCTION public.caller_mfa_challenge_pending()",
    );
    expect(helper).toContain("auth.jwt() ->> 'mfa_enrolled'");
    expect(helper).toContain("auth.jwt() ->> 'aal'");
    // A token minted before migration 037 has no claim and must pass.
    expect(helper).toContain("COALESCE((auth.jwt() ->> 'mfa_enrolled')::BOOLEAN, FALSE)");
    expect(helper).toContain("LANGUAGE SQL STABLE");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.caller_mfa_challenge_pending() FROM PUBLIC, anon;",
    );
  });

  it("restates caller_org_id from 016 with only the guard added", () => {
    const header = "CREATE OR REPLACE FUNCTION public.caller_org_id()";
    const before = functionText(previous, header);
    const after = functionText(migration, header);
    expect(
      before.replace(
        "  WHERE claimed.org_id IS NOT NULL\n",
        `  WHERE claimed.org_id IS NOT NULL\n    ${GUARD}\n`,
      ),
    ).toBe(after);
  });

  it("restates is_gridmaster from 016 with only the guard added", () => {
    const header = "CREATE OR REPLACE FUNCTION public.is_gridmaster()";
    const before = functionText(previous, header);
    const after = functionText(migration, header);
    expect(
      before.replace(
        "  SELECT EXISTS (",
        "  SELECT NOT public.caller_mfa_challenge_pending() AND EXISTS (",
      ),
    ).toBe(after);
  });

  it("leaves the definer and search_path settings in place", () => {
    for (const header of [
      "CREATE OR REPLACE FUNCTION public.is_gridmaster()",
      "CREATE OR REPLACE FUNCTION public.caller_org_id()",
    ]) {
      const text = functionText(migration, header);
      expect(text).toContain("SECURITY DEFINER");
      expect(text).toContain("SET search_path = 'public'");
    }
  });
});
