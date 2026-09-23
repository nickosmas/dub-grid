import { describe, expect, it } from "vitest";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

/**
 * Finding F-01: `caller_mfa_challenge_pending` maps an absent `mfa_enrolled`
 * claim to "not enrolled", so a hook that stopped minting the claim would
 * disable MFA enforcement without raising anything. The hook has been
 * redefined in 002, 021 and 037, and the per-migration tests read their own
 * fixed file, so none of them would notice the fourth time. These assertions
 * read whichever definition a migrated database ends up with.
 */
const HOOK_MINTED_CLAIMS = [
  "employee_status",
  "mfa_enrolled",
  "org_id",
  "org_name",
  "org_role",
  "org_slug",
  "platform_role",
] as const;

describe("the live access token hook keeps minting every claim the app gates on", () => {
  const hook = latestFunctionDefinition("custom_access_token_hook");

  it.each(HOOK_MINTED_CLAIMS)("still sets %s", (claim) => {
    expect(hook.text).toContain(`'{${claim}}'`);
  });

  it("derives mfa_enrolled from the auth schema, never from client-written state", () => {
    expect(hook.text).toContain("FROM auth.mfa_factors AS factor");
    expect(hook.text).toContain("factor.status = 'verified'");
    expect(hook.text).toContain("factor.factor_type = 'totp'");
    // profiles.mfa_enabled is writable by the member it describes.
    expect(hook.text).not.toContain("mfa_enabled");
  });

  it("resolves the newest definition rather than a fixed migration", () => {
    expect(hook.file).toBe("037_mfa_enrolled_claim.sql");
  });
});
