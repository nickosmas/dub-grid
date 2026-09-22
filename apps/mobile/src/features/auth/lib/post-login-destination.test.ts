import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_LOGIN_DESTINATION,
  resolvePostLoginDestination,
} from "./post-login-destination";

describe("resolvePostLoginDestination", () => {
  it("keeps an in-app path a protected route asked for", () => {
    expect(resolvePostLoginDestination("/alerts/abc-123")).toBe("/alerts/abc-123");
    expect(resolvePostLoginDestination("/shift/emp-1/2026-05-04")).toBe("/shift/emp-1/2026-05-04");
  });

  it("falls back to home for anything that is not a plain in-app path", () => {
    for (const next of [
      undefined,
      "",
      "https://evil.example/phish",
      "//evil.example",
      "alerts/abc",
      "/(auth)/login",
      "/login",
      "/login?next=/alerts/abc",
      "/forgot-password",
      "/reset-password",
      "/onboarding",
      "/",
      ["/alerts/abc"],
    ]) {
      expect(resolvePostLoginDestination(next)).toBe(DEFAULT_POST_LOGIN_DESTINATION);
    }
  });
});
