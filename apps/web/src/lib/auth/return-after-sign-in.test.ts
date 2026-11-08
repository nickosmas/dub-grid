import { beforeEach, describe, expect, it } from "vitest";
import { rememberPageForSignIn, takeReturnDestination } from "./return-after-sign-in";

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("return after sign-in", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns the same person to the page they were on", () => {
    rememberPageForSignIn("user-1", "/people/42?tab=schedule#shifts", NOW);
    expect(takeReturnDestination("/dashboard", "user-1", NOW + HOUR)).toBe(
      "/people/42?tab=schedule#shifts",
    );
  });

  it("goes through the terms page first when it is in the way", () => {
    rememberPageForSignIn("user-1", "/schedule?view=month", NOW);
    expect(takeReturnDestination("/accept-terms?next=%2Fdashboard", "user-1", NOW)).toBe(
      `/accept-terms?next=${encodeURIComponent("/schedule?view=month")}`,
    );
  });

  it("sends someone else to the usual home and forgets the page", () => {
    rememberPageForSignIn("user-1", "/schedule", NOW);
    expect(takeReturnDestination("/dashboard", "user-2", NOW)).toBe("/dashboard");
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");
  });

  it("is used once", () => {
    rememberPageForSignIn("user-1", "/schedule", NOW);
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/schedule");
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");
  });

  it("forgets a page older than 12 hours", () => {
    rememberPageForSignIn("user-1", "/schedule", NOW);
    expect(takeReturnDestination("/dashboard", "user-1", NOW + 13 * HOUR)).toBe("/dashboard");
  });

  it("returns a Gridmaster only within the portal, and staff only outside it", () => {
    rememberPageForSignIn("user-1", "/gridmaster/organizations", NOW);
    expect(takeReturnDestination("/gridmaster", "user-1", NOW)).toBe("/gridmaster/organizations");

    rememberPageForSignIn("user-1", "/gridmaster/organizations", NOW);
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");

    rememberPageForSignIn("user-1", "/schedule", NOW);
    expect(takeReturnDestination("/gridmaster", "user-1", NOW)).toBe("/gridmaster");
  });

  it("never remembers a sign-in page or another site", () => {
    for (const page of [
      "/login",
      "/goodbye?reason=inactivity",
      "/auth/verify",
      "//evil.example/x",
    ]) {
      rememberPageForSignIn("user-1", page, NOW);
      expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");
    }
  });

  it("ignores a tampered entry", () => {
    sessionStorage.setItem(
      "dg-return-after-sign-in",
      JSON.stringify({ page: "https://evil.example/", userId: "user-1", at: NOW }),
    );
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");
    sessionStorage.setItem("dg-return-after-sign-in", "not json");
    expect(takeReturnDestination("/dashboard", "user-1", NOW)).toBe("/dashboard");
  });

  it("leaves any other destination alone", () => {
    rememberPageForSignIn("user-1", "/schedule", NOW);
    expect(takeReturnDestination("/billing-required", "user-1", NOW)).toBe("/billing-required");
  });
});
