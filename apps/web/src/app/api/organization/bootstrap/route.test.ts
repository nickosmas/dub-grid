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

// Builder calls are recorded so a test can assert the shape of a query the
// fan-out issues, which happens synchronously before the deadline rejects.
const queryCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

function hangingQuery(table: string) {
  const pending = new Promise<never>(() => {});
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      queryCalls.push({ table, method, args });
      return query;
    };
  const query = {
    select: record("select"),
    eq: record("eq"),
    order: record("order"),
    is: record("is"),
    not: record("not"),
    single: record("single"),
    maybeSingle: record("maybeSingle"),
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
    queryCalls.length = 0;
    serviceFrom.mockImplementation((table: string) => hangingQuery(table));
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

  // The entry gate this feeds decides whether a member waits or is let in, so
  // the filters are the whole behaviour: an archived membership, a non-super
  // admin, or an unfinished onboarding must not count as an open organization.
  it("asks whether any active super admin has finished their own onboarding", async () => {
    await GET(
      new NextRequest("http://acme.localhost/api/organization/bootstrap", {
        headers: { host: "acme.localhost" },
      }),
    );

    const membershipCalls = queryCalls.filter((call) => call.table === "organization_memberships");
    expect(membershipCalls).toContainEqual({
      table: "organization_memberships",
      method: "eq",
      args: ["org_role", "super_admin"],
    });
    expect(membershipCalls).toContainEqual({
      table: "organization_memberships",
      method: "is",
      args: ["archived_at", null],
    });
    expect(membershipCalls).toContainEqual({
      table: "organization_memberships",
      method: "not",
      args: ["onboarding_completed_at", "is", null],
    });
  });

  it("reuses the verified bootstrap actor during organization authorization", async () => {
    const request = new NextRequest("http://acme.localhost/api/organization/bootstrap", {
      headers: { host: "acme.localhost" },
    });

    await GET(request);

    expect(requireAuthenticatedUserWithClaims).toHaveBeenCalledTimes(1);
    expect(requireOrgPermissions).toHaveBeenCalledTimes(1);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      request,
      ORG_ID,
      expect.any(Function),
      expect.objectContaining({
        allowLockedOrganization: true,
        allowDuringSetup: true,
        actor: { id: USER_ID },
      }),
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
