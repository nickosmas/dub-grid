import { describe, expect, it } from "vitest";
import {
  getMobileAuthIdentity,
  getMobileAuthIdentityKey,
  getUserIdFromAccessToken,
  isSameMobileAuthIdentity,
} from "./access-token";

function encodeSegment(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tokenWithClaims(claims: object): string {
  return [encodeSegment({ alg: "HS256", typ: "JWT" }), encodeSegment(claims), "signature"].join(
    ".",
  );
}

describe("getUserIdFromAccessToken", () => {
  it("reads the sub claim", () => {
    expect(getUserIdFromAccessToken(tokenWithClaims({ sub: "user-1" }))).toBe("user-1");
  });

  // The whole reason this exists: Supabase rotates the token string on its own,
  // and cache keys built from it churned on every rotation.
  it("returns the same id for two tokens issued to the same user", () => {
    const first = tokenWithClaims({ sub: "user-1", iat: 1 });
    const second = tokenWithClaims({ sub: "user-1", iat: 2 });

    expect(first).not.toBe(second);
    expect(getUserIdFromAccessToken(first)).toBe(getUserIdFromAccessToken(second));
  });

  it("separates different users", () => {
    expect(getUserIdFromAccessToken(tokenWithClaims({ sub: "user-1" }))).not.toBe(
      getUserIdFromAccessToken(tokenWithClaims({ sub: "user-2" })),
    );
  });

  // Payloads are base64url and unpadded, so a naive atob would reject some of
  // them outright depending on the claim lengths.
  it("decodes payloads of every padding length", () => {
    for (const suffix of ["", "a", "ab", "abc"]) {
      const userId = `user-${suffix}`;
      expect(getUserIdFromAccessToken(tokenWithClaims({ sub: userId }))).toBe(userId);
    }
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["not a jwt", "just-a-string"],
    ["a jwt with no payload segment", "header..signature"],
    ["a jwt with an undecodable payload", "header.!!!!.signature"],
    ["a jwt with no sub claim", tokenWithClaims({ role: "authenticated" })],
    ["a jwt with a non-string sub", tokenWithClaims({ sub: 42 })],
  ])("returns null for %s", (_label, token) => {
    expect(getUserIdFromAccessToken(token)).toBeNull();
  });
});

describe("mobile auth identity", () => {
  it("classifies a missing token as anonymous", () => {
    expect(getMobileAuthIdentity(null)).toEqual({
      kind: "anonymous",
      userId: null,
      orgId: null,
    });
    expect(getMobileAuthIdentityKey(null)).toEqual(["anonymous", null, null]);
  });

  it.each([
    "just-a-string",
    "header.!!!!.signature",
    tokenWithClaims({ org_id: "org-1" }),
    tokenWithClaims({ sub: 42, org_id: "org-1" }),
  ])("classifies an unreadable authenticated token separately from sign-out", (token) => {
    expect(getMobileAuthIdentity(token)).toEqual({
      kind: "unreadable",
      userId: null,
      orgId: null,
    });
    expect(getMobileAuthIdentityKey(token)).toEqual(["unreadable", null, null]);
  });

  it("keeps the same identity and key when only the token rotates", () => {
    const firstToken = tokenWithClaims({ sub: "user-1", org_id: "org-1", iat: 1 });
    const secondToken = tokenWithClaims({ sub: "user-1", org_id: "org-1", iat: 2 });
    const first = getMobileAuthIdentity(firstToken);
    const second = getMobileAuthIdentity(secondToken);

    expect(firstToken).not.toBe(secondToken);
    expect(isSameMobileAuthIdentity(first, second)).toBe(true);
    expect(getMobileAuthIdentityKey(firstToken)).toEqual(getMobileAuthIdentityKey(secondToken));
  });

  it("separates different users in the same organization", () => {
    const first = getMobileAuthIdentity(tokenWithClaims({ sub: "user-1", org_id: "org-1" }));
    const second = getMobileAuthIdentity(tokenWithClaims({ sub: "user-2", org_id: "org-1" }));

    expect(isSameMobileAuthIdentity(first, second)).toBe(false);
  });

  it("separates the same user in different organizations", () => {
    const first = getMobileAuthIdentity(tokenWithClaims({ sub: "user-1", org_id: "org-1" }));
    const second = getMobileAuthIdentity(tokenWithClaims({ sub: "user-1", org_id: "org-2" }));

    expect(isSameMobileAuthIdentity(first, second)).toBe(false);
  });

  it("keeps an authenticated identity when the token has no organization claim", () => {
    expect(getMobileAuthIdentity(tokenWithClaims({ sub: "gridmaster-1" }))).toEqual({
      kind: "authenticated",
      userId: "gridmaster-1",
      orgId: null,
    });
  });
});
