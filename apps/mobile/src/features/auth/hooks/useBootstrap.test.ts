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
  queryFn: (context?: { signal?: AbortSignal }) => unknown;
  enabled: boolean;
  retry: (failureCount: number, error: unknown) => boolean;
  retryDelay: (failureCount: number, error: unknown) => number;
  refetchOnReconnect: boolean;
  refetchOnWindowFocus: boolean;
};

function optionsFor(token: string | null): QueryOptions {
  useQuery.mockReturnValue({});
  useBootstrap(token);
  return useQuery.mock.calls.at(-1)?.[0] as QueryOptions;
}

/** A structurally real access token: header.payload.signature, claims in the payload. */
function tokenFor(userId: string, issuedAt = "issued", orgId: string | null = "org-1"): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode(orgId ? { sub: userId, org_id: orgId, iat: issuedAt } : { sub: userId, iat: issuedAt }),
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
    expect(optionsFor(tokenFor("user-aaa")).queryKey).toEqual([
      "mobile",
      "bootstrap",
      "user-aaa",
      "org-1",
    ]);
    expect(optionsFor(tokenFor("user-bbb")).queryKey).toEqual([
      "mobile",
      "bootstrap",
      "user-bbb",
      "org-1",
    ]);
  });

  // The tenancy half of the key, and the reason it exists. `sub` does not change
  // across an org switch, so a user-only key is byte-identical either side of
  // one: the switch clears the cache, but an observer that refetches on the OLD
  // token before the new session propagates writes the previous org's bootstrap
  // — org, permissions, memberships, feature flags — onto the exact key the new
  // org then reads, and staleTime serves it as fresh.
  it("keys the cache per organization, so a switch cannot reuse the previous org's entry", () => {
    const inOrgA = optionsFor(tokenFor("user-aaa", "issued", "org-a"));
    const inOrgB = optionsFor(tokenFor("user-aaa", "issued", "org-b"));

    expect(inOrgA.queryKey).not.toEqual(inOrgB.queryKey);
    expect(inOrgA.queryKey).toEqual(["mobile", "bootstrap", "user-aaa", "org-a"]);
    expect(inOrgB.queryKey).toEqual(["mobile", "bootstrap", "user-aaa", "org-b"]);
  });

  // A gridmaster, or a user whose membership the access-token hook refused, has
  // no org claim at all. That is its own cache identity, not a shared one.
  it("gives a token with no org claim its own key", () => {
    expect(optionsFor(tokenFor("user-aaa", "issued", null)).queryKey).toEqual([
      "mobile",
      "bootstrap",
      "user-aaa",
      null,
    ]);
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
    expect(optionsFor("not-a-jwt").queryKey).toEqual(["mobile", "bootstrap", null, null]);
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

  it("passes React Query cancellation through to the bootstrap request", () => {
    const controller = new AbortController();
    const options = optionsFor("token-123");

    options.queryFn({ signal: controller.signal });

    expect(getBootstrap).toHaveBeenCalledWith("token-123", controller.signal);
  });

  it("uses the bounded shared recovery policy and honors Retry-After", () => {
    const options = optionsFor("token-123");
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(options.retry(2, { status: 503 })).toBe(true);
    expect(options.retry(3, { status: 503 })).toBe(false);
    expect(options.retry(0, { status: 400 })).toBe(false);
    expect(options.retryDelay(0, { status: 429, retryAfter: "4" })).toBe(4_000);

    vi.restoreAllMocks();
  });

  it("lets React Query own one reconnect and foreground refetch lifecycle", () => {
    const options = optionsFor("token-123");

    expect(options.refetchOnReconnect).toBe(true);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("shares the 'mobile' key prefix so a sign-out cache clear reaches it", () => {
    expect(optionsFor("token-123").queryKey[0]).toBe("mobile");
  });
});
