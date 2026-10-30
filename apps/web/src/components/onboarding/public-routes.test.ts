import { describe, expect, it } from "vitest";
import { isPublicRoute, isSignInRoute } from "./public-routes";

const SIGN_IN_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/auth/verify",
  "/auth/callback",
];

describe("isSignInRoute", () => {
  it.each(SIGN_IN_PATHS)("renders %s without the app shell", (path) => {
    expect(isSignInRoute(path)).toBe(true);
  });

  it.each(["/dashboard", "/schedule", "/accept-terms", "/goodbye", "/onboarding", "/loginx", "/"])(
    "keeps the app shell on %s",
    (path) => {
      expect(isSignInRoute(path)).toBe(false);
    },
  );

  // The gates already let these pages through; leaving the shell must not
  // change what a gate decides for them.
  it.each(SIGN_IN_PATHS)("treats %s as public too", (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });
});
