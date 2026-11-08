import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./auth-cookie-options";

describe("authCookieOptions", () => {
  it("marks the session cookies Secure over https", () => {
    expect(authCookieOptions("https:")).toEqual({ sameSite: "lax", secure: true });
  });

  it("leaves Secure off for local http", () => {
    expect(authCookieOptions("http:")).toEqual({ sameSite: "lax", secure: false });
  });
});
