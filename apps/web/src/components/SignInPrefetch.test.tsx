import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

let mockSession: { access_token: string } | null = null;
let mockTransitionPending = false;
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ session: mockSession }) }));
vi.mock("@/lib/auth-transition", () => ({
  useAuthTransitionPending: () => mockTransitionPending,
}));

import SignInPrefetch, { primeSignInQueries } from "./SignInPrefetch";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function token(claims: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: USER_ID, ...claims })}.sig`;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestedPaths(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), "http://x").pathname);
}

describe("primeSignInQueries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it("starts a member's first screen together under the keys its components read", async () => {
    primeSignInQueries(queryClient, token({ org_id: ORG_ID, org_role: "user" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(requestedPaths().sort()).toEqual(
      [
        "/api/account/org-context",
        "/api/account/permissions",
        "/api/account/terms",
        "/api/employees/manage",
        "/api/organization/bootstrap",
      ].sort(),
    );
    for (const key of [
      queryKeys.account.permissions(USER_ID, ORG_ID),
      queryKeys.org.bootstrap(),
      queryKeys.account.orgContext(),
      queryKeys.account.terms(USER_ID),
    ]) {
      await waitFor(() => expect(queryClient.getQueryState(key)?.status).toBe("success"));
    }
    expect(queryClient.getQueryState(queryKeys.employees.all(ORG_ID))).toBeDefined();
  });

  it("adds a Super Admin's billing to the same wave, not ahead of employees", () => {
    primeSignInQueries(queryClient, token({ org_id: ORG_ID, org_role: "super_admin" }));

    expect(requestedPaths()).toEqual(
      expect.arrayContaining(["/api/billing", "/api/employees/manage"]),
    );
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does nothing for a Gridmaster, who has no organization shell", () => {
    primeSignInQueries(queryClient, token({ platform_role: "gridmaster" }));
    primeSignInQueries(queryClient, token({ platform_role: "gridmaster", org_id: ORG_ID }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does nothing for a token it cannot read", () => {
    primeSignInQueries(queryClient, "not-a-token");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("SignInPrefetch", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockSession = { access_token: token({ org_id: ORG_ID, org_role: "user" }) };
    mockTransitionPending = true;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  function renderPrefetch() {
    return render(
      <QueryClientProvider client={queryClient}>
        <SignInPrefetch />
      </QueryClientProvider>,
    );
  }

  it("primes the queries and observes the bootstrap during the sign-in handoff", async () => {
    renderPrefetch();

    await waitFor(() => expect(requestedPaths()).toContain("/api/organization/bootstrap"));
    expect(requestedPaths()).toContain("/api/employees/manage");
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: queryKeys.org.bootstrap() })
        ?.getObserversCount(),
    ).toBe(1);
  });

  it("stays out of ordinary page loads", () => {
    mockTransitionPending = false;
    renderPrefetch();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for a session", () => {
    mockSession = null;
    renderPrefetch();
    expect(fetch).not.toHaveBeenCalled();
  });
});
