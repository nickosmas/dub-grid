import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STEP_UP_REQUIRED_CODE } from "@dubgrid/authz";
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

const repoRoot = resolve(process.cwd(), "..", "..");
/** Claims Supabase itself issues, which the hook does not mint. */
const STANDARD_CLAIMS = new Set(["aal", "amr", "session_id", "sub", "role", "email", "exp", "iat"]);

function claimKeys(file: string, typeName: string): string[] {
  const source = readFileSync(resolve(repoRoot, file), "utf8");
  const start = source.search(new RegExp(`(interface|type) ${typeName}\\b`));
  if (start < 0) throw new Error(`${typeName} not found in ${file}`);
  const body = source.slice(source.indexOf("{", start), source.indexOf("}", start));
  return [...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((match) => match[1]!);
}

// The types that read claims were unlinked from the hook that mints them, so
// a rename on either side went unnoticed (41d2).
describe("the claim types read only claims the hook mints", () => {
  it.each([
    ["apps/web/src/proxy.ts", "JWTClaims"],
    ["packages/mobile-api-core/src/auth.ts", "MobileAuthClaims"],
  ])("%s %s", (file, typeName) => {
    const custom = claimKeys(file, typeName).filter((claim) => !STANDARD_CLAIMS.has(claim));

    expect(custom.length).toBeGreaterThan(0);
    for (const claim of custom) {
      expect(HOOK_MINTED_CLAIMS as readonly string[]).toContain(claim);
    }
  });
});

// Mobile has no dependency on @dubgrid/authz, so its copy is checked here.
describe("the mobile step-up code", () => {
  it("matches the code the server sends", () => {
    const source = readFileSync(
      resolve(repoRoot, "apps/mobile/src/features/profile/lib/step-up.ts"),
      "utf8",
    );
    expect(source).toContain(`payload.code === "${STEP_UP_REQUIRED_CODE}"`);
  });
});
