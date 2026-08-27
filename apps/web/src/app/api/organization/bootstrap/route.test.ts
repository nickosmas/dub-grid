import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const requireOrgPermissions = vi.fn();
const cacheThrough = vi.fn();
const withTimeoutOrThrow = vi.fn();
const serviceFrom = vi.fn();
const loggerError = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (...args: unknown[]) =>
    requireAuthenticatedUserWithClaims(...args),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/cache", () => ({
  CacheKey: { bootstrapConfig: (orgId: string) => `bootstrap:${orgId}` },
  TTL: { MIDDLEWARE: 30 },
  cacheThrough: (...args: unknown[]) => cacheThrough(...args),
}));

vi.mock("@/lib/with-timeout", () => ({
  withTimeoutOrThrow: (...args: unknown[]) => withTimeoutOrThrow(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => loggerError(...args) },
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function hangingQuery() {
  const pending = new Promise<never>(() => {});
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    is: () => query,
    single: () => query,
    maybeSingle: () => query,
    then: pending.then.bind(pending),
  };
  return query;
}

describe("GET /api/organization/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      claims: { org_id: ORG_ID },
    });
    requireOrgPermissions.mockResolvedValue({
      permissions: { isSuperAdmin: false },
      serviceClient: { from: (table: string) => serviceFrom(table) },
      userClient: {},
    });
    serviceFrom.mockImplementation(() => hangingQuery());
    cacheThrough.mockImplementation((_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
      fetcher(),
    );
    withTimeoutOrThrow.mockImplementation(
      (work: Promise<unknown>, _timeoutMs: number, label: string) =>
        label === "organization bootstrap fanout"
          ? Promise.reject(new Error("fanout timed out"))
          : work,
    );
  });

  it("returns a controlled error when the database fan-out exceeds its deadline", async () => {
    const response = await GET(
      new NextRequest("http://acme.localhost/api/organization/bootstrap", {
        headers: { host: "acme.localhost" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't load your organization. Refresh and try again.",
    });
    expect(withTimeoutOrThrow).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.any(Number),
      "organization bootstrap fanout",
    );
    expect(withTimeoutOrThrow).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.any(Number),
      "organization bootstrap config",
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, userId: USER_ID }),
      "organization bootstrap GET failed",
    );
  });
});
