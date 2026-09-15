import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  parseInternalDestination,
  resolveAuthActionDestination,
} from "@/lib/auth/integrity-contract";

describe("parseInternalDestination", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/people?status=active#directory", "/people?status=active#directory"],
    ["/reset-password?source=email#form", "/reset-password?source=email#form"],
    ["/people/%E2%9C%93", "/people/%E2%9C%93"],
    ["/a/../dashboard", "/dashboard"],
  ])("preserves or safely normalizes the internal destination %s", (raw, expected) => {
    expect(parseInternalDestination(raw, "/fallback")).toBe(expected);
  });

  it.each([
    null,
    "",
    "dashboard",
    "https://evil.example/path",
    "https://user:password@evil.example/path",
    "//evil.example/path",
    "///evil.example/path",
    "\\\\evil.example\\path",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2f%2fevil.example/path",
    "/%252f%252fevil.example/path",
    "/bad%",
    "/line\nbreak",
    " /dashboard",
    "/dashboard ",
  ])("rejects unsafe destination %j", (raw) => {
    expect(parseInternalDestination(raw, "/fallback")).toBe("/fallback");
  });

  it("never turns an absolute web URL into an internal destination", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(parseInternalDestination(url, "/fallback")).toBe("/fallback");
      }),
    );
  });

  it("keeps generated plain path segments on the application origin", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { minLength: 1, maxLength: 5 }),
        (segments) => {
          const path = `/${segments.join("/")}`;
          expect(parseInternalDestination(path, "/fallback")).toBe(path);
        },
      ),
    );
  });
});

describe("resolveAuthActionDestination", () => {
  it("binds recovery to the reset page while preserving its allowed query and fragment", () => {
    expect(resolveAuthActionDestination("recovery", "/reset-password?from=email#form")).toEqual({
      action: "recovery",
      destination: "/reset-password?from=email#form",
    });
  });

  it.each([null, "https://evil.example", "/dashboard", "/%2f%2fevil.example"])(
    "uses the fixed recovery fallback for destination %j",
    (destination) => {
      expect(resolveAuthActionDestination("recovery", destination)).toEqual({
        action: "recovery",
        destination: "/reset-password",
      });
    },
  );

  it.each([null, "signup", "invite", "magiclink", "email_change", "reauthentication"])(
    "rejects unsupported Auth action %j",
    (action) => {
      expect(resolveAuthActionDestination(action, "/reset-password")).toBeNull();
    },
  );
});
