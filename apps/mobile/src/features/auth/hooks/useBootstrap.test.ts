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

describe("useBootstrap", () => {
  beforeEach(() => {
    useQuery.mockReset();
    getBootstrap.mockReset();
  });

  // The token is part of the query key. Without it, signing in as a different
  // user on the same device would read the previous account's bootstrap out of
  // the cache — org, permissions and linked employee included.
  it("keys the cache per access token", () => {
    expect(optionsFor("token-aaa").queryKey).toEqual(["mobile", "bootstrap", "token-aaa"]);
    expect(optionsFor("token-bbb").queryKey).toEqual(["mobile", "bootstrap", "token-bbb"]);
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
