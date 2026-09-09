import type { Session } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  changesWebAuthOrganization,
  crossesWebAuthDataBoundary,
  getWebAuthIdentity,
  isSameWebAuthIdentity,
} from "./session-identity";

function session(userId: string, orgId: string | null, issuedAt = 1): Session {
  const claims = { sub: userId, org_id: orgId ?? undefined, iat: issuedAt };
  const accessToken = `header.${btoa(JSON.stringify(claims))}.signature`;
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

describe("web auth session identity", () => {
  it("retains identity across token rotation", () => {
    const first = getWebAuthIdentity(session("user-1", "org-1", 1));
    const second = getWebAuthIdentity(session("user-1", "org-1", 2));

    expect(isSameWebAuthIdentity(first, second)).toBe(true);
    expect(crossesWebAuthDataBoundary(first, second)).toBe(false);
  });

  it("separates user and organization boundaries", () => {
    const first = getWebAuthIdentity(session("user-1", "org-1"));
    const otherUser = getWebAuthIdentity(session("user-2", "org-1"));
    const otherOrganization = getWebAuthIdentity(session("user-1", "org-2"));

    expect(crossesWebAuthDataBoundary(first, otherUser)).toBe(true);
    expect(crossesWebAuthDataBoundary(first, otherOrganization)).toBe(true);
    expect(changesWebAuthOrganization(first, otherUser)).toBe(false);
    expect(changesWebAuthOrganization(first, otherOrganization)).toBe(true);
  });

  it("treats malformed or mismatched sessions as unreadable", () => {
    const malformed = { ...session("user-1", "org-1"), access_token: "malformed" };
    const mismatched = { ...session("user-1", "org-1"), user: { id: "user-2" } } as Session;

    expect(getWebAuthIdentity(malformed)).toEqual({
      kind: "unreadable",
      userId: null,
      orgId: null,
    });
    expect(getWebAuthIdentity(mismatched)).toEqual({
      kind: "unreadable",
      userId: null,
      orgId: null,
    });
  });

  it("does not clear anonymous state merely because a user signs in", () => {
    expect(
      crossesWebAuthDataBoundary(
        getWebAuthIdentity(null),
        getWebAuthIdentity(session("user-1", "org-1")),
      ),
    ).toBe(false);
  });
});
