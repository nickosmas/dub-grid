import { describe, expect, it } from "vitest";
import { redactSecurityError, redactSecurityText, redactSecurityValue } from "./security-redaction";

describe("security redaction", () => {
  it("redacts secret query values, bearer credentials, and JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature";
    const text = redactSecurityText(
      `url=/auth?token_hash=abc123&next=/reset Authorization: Bearer top.secret ${jwt}`,
    );

    expect(text).not.toContain("abc123");
    expect(text).not.toContain("top.secret");
    expect(text).not.toContain(jwt);
  });

  it("redacts secret-named fields recursively while retaining safe context", () => {
    expect(
      redactSecurityValue({
        context: "invitation-register",
        nested: { password: "hidden", token: "hidden", outcome: "rejected" },
      }),
    ).toEqual({
      context: "invitation-register",
      nested: { password: "[REDACTED]", token: "[REDACTED]", outcome: "rejected" },
    });
  });

  it("sanitizes error messages without returning the original Error", () => {
    const original = new Error("failed https://example.test/?code=credential");
    const sanitized = redactSecurityError(original);

    expect(sanitized).toBeInstanceOf(Error);
    expect(sanitized).not.toBe(original);
    expect((sanitized as Error).message).not.toContain("credential");
  });
});
