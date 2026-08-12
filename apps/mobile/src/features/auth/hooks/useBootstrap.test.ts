import { beforeEach, describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();
const getBootstrap = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock("../../../shared/lib/api", () => ({
  getBootstrap: (...args: unknown[]) => getBootstrap(...args),
}));

import { useBootstrap } from "./useBootstrap";

type QueryOptions = {
  queryKey: unknown[];
  queryFn: () => unknown;
  enabled: boolean;
};

function optionsFor(token: string | null): QueryOptions {
  useQuery.mockReturnValue({});
  useBootstrap(token);
  return useQuery.mock.calls.at(-1)?.[0] as QueryOptions;
}

/** A structurally real access token: header.payload.signature, `sub` claim. */
function tokenFor(userId: string, issuedAt = "issued"): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: userId, iat: issuedAt }),
    "signature",
  ].join(".");
}

describe("useBootstrap", () => {
  beforeEach(() => {
    useQuery.mockReset();
    getBootstrap.mockReset();
  });

  // The user is part of the query key. Without it, signing in as a different
  // user on the same device could read the previous account's bootstrap out of
  // the cache: org, permissions and linked employee included.
  it("keys the cache per user", () => {
    expect(optionsFor(tokenFor("user-aaa")).queryKey).toEqual(["mobile", "bootstrap", "user-aaa"]);
    expect(optionsFor(tokenFor("user-bbb")).queryKey).toEqual(["mobile", "bootstrap", "user-bbb"]);
  });

  // Supabase runs with `autoRefreshToken`, so the token string rotates on its
  // own mid-session. Keying on it sent the query to a fresh, empty cache entry
  // on every rotation, which put `useTabsGate` back into `isLoading` and threw
  // the launch splash back over a running app.
  it("keeps the same key when only the access token rotates", () => {
    const first = optionsFor(tokenFor("user-aaa", "issued-first"));
    const second = optionsFor(tokenFor("user-aaa", "issued-second"));

    expect(first.queryKey).toEqual(second.queryKey);
  });

  // A token we can't read still has to produce a usable key. Sign-out clears
  // the whole query cache, so nothing of a previous account survives under it.
  it("falls back to a null user segment for an unreadable token", () => {
    expect(optionsFor("not-a-jwt").queryKey).toEqual(["mobile", "bootstrap", null]);
  });

  // Enabled is driven off the token so a signed-out render never fires a
  // request with a null token, which would 401 and trigger a session reset
  // on a user who is already signed out.
  it("stays disabled without a token", () => {
    expect(optionsFor(null).enabled).toBe(false);
    expect(optionsFor("token-123").enabled).toBe(true);
  });

  it("fetches with the access token it was given", () => {
    const options = optionsFor("token-123");

    options.queryFn();

    expect(getBootstrap).toHaveBeenCalledWith("token-123");
  });

  it("shares the 'mobile' key prefix so a sign-out cache clear reaches it", () => {
    expect(optionsFor("token-123").queryKey[0]).toBe("mobile");
  });
});
