import { describe, expect, it } from "vitest";
import { bearerMatchesSecret } from "./cron-auth";

describe("bearerMatchesSecret", () => {
  const secret = "s3cr3t-value-that-is-long-enough";

  it("accepts the exact bearer credential", () => {
    expect(bearerMatchesSecret(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses a wrong secret, a wrong scheme, and a missing header", () => {
    expect(bearerMatchesSecret(`Bearer ${secret}x`, secret)).toBe(false);
    expect(bearerMatchesSecret(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
    expect(bearerMatchesSecret(secret, secret)).toBe(false);
    expect(bearerMatchesSecret(`Basic ${secret}`, secret)).toBe(false);
    expect(bearerMatchesSecret(null, secret)).toBe(false);
    expect(bearerMatchesSecret("", secret)).toBe(false);
  });

  it("refuses a credential that only shares a prefix", () => {
    expect(bearerMatchesSecret("Bearer s3cr3t", secret)).toBe(false);
  });
});
