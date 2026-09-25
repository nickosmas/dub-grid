import { describe, expect, it } from "vitest";
import { simulatedTokenClaims } from "./simulated-jwt";

describe("simulatedTokenClaims", () => {
  it("carries the enrollment claim a real token always has", () => {
    expect(simulatedTokenClaims({ sub: "user-1" })).toEqual({ sub: "user-1", mfa_enrolled: false });
  });

  it("lets a test express an enrolled caller", () => {
    expect(simulatedTokenClaims({ sub: "user-1", mfa_enrolled: true, aal: "aal1" })).toEqual({
      sub: "user-1",
      mfa_enrolled: true,
      aal: "aal1",
    });
  });
});
