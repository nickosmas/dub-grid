import { describe, expect, it } from "vitest";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

/**
 * Finding F-01, runtime half. 038 read an absent `mfa_enrolled` claim as "not
 * enrolled"; 041 reverses that default. These assertions read the newest
 * definition, so a later migration cannot quietly restore the fail-open.
 */
describe("caller_mfa_challenge_pending fails closed (migration 041)", () => {
  const helper = latestFunctionDefinition("caller_mfa_challenge_pending");

  it("is the definition 041 installs", () => {
    expect(helper.file).toBe("041_mfa_claim_fails_closed.sql");
  });

  it("treats only the hook's boolean false as not enrolled", () => {
    expect(helper.text).toContain("auth.jwt() -> 'mfa_enrolled' = 'false'::jsonb");
    // A text compare would accept the JSON string "false" as well.
    expect(helper.text).not.toContain("auth.jwt() ->> 'mfa_enrolled'");
  });

  it("still lets an answered challenge through regardless of the claim", () => {
    expect(helper.text).toContain("COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'");
  });

  it("defaults to pending, which is what closes the bypass", () => {
    expect(helper.text).toContain("ELSE TRUE");
  });

  it("never casts, so a malformed claim denies instead of raising", () => {
    expect(helper.text).not.toContain("::BOOLEAN");
  });

  it("stays a token-only decision, so no policy can stall on a query", () => {
    expect(helper.text).toContain("LANGUAGE SQL STABLE");
    expect(helper.text).not.toContain("FROM ");
  });
});
