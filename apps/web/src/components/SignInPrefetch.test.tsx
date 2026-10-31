import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

let mockSession: { access_token: string } | null = null;
let mockTransitionPending = false;
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ session: mockSession }) }));
let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
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

function answerAsReadyOrganization() {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path === "/api/organization/bootstrap") {
      return json({
        org: { id: ORG_ID, name: "Calm Haven", shiftDisplayMode: "code" },
        isGridmaster: false,
        entryGate: {
          onboardingCompleted: true,
          adminOnboardingCompleted: true,
          billingLocked: false,
        },
        focusAreas: [],
        allAssignmentDefinitions: [],
        allAbsenceTypes: [],
        shiftCategories: [],
        jobs: [],
      });
    }
    if (path === "/api/account/permissions") {
      return json({
        permissions: { role: "user", level: 1, canEditShifts: false },
        isOnSchedule: true,
        isManagementUser: false,
      });
    }
    return json({});
  });
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

  it("starts the dashboard's default week once the organization and permissions answer", async () => {
    answerAsReadyOrganization();

    primeSignInQueries(queryClient, token({ org_id: ORG_ID, org_role: "user" }));

    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .some((query) => query.queryKey.includes("cells") && query.queryKey.includes("viewer")),
      ).toBe(true),
    );
    expect(requestedPaths()).toContain("/api/schedule/manage");
  });

  it("leaves the dashboard alone when the sign-in lands somewhere else first", async () => {
    answerAsReadyOrganization();

    primeSignInQueries(queryClient, token({ org_id: ORG_ID, org_role: "user" }), {
      dashboard: false,
    });

    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.org.bootstrap())?.status).toBe("success"),
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryState(queryKeys.account.permissions(USER_ID, ORG_ID))?.status,
      ).toBe("success"),
    );
    // Give the priming that follows those two answers its turn to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestedPaths()).not.toContain("/api/schedule/manage");
    expect(requestedPaths()).not.toContain("/api/employees/manage");
  });

  it("adds a Super Admin's billing to the same wave, not ahead of employees", () => {
    primeSignInQueries(queryClient, token({ org_id: ORG_ID, org_role: "super_admin" }));

    expect(requestedPaths()).toEqual(
      expect.arrayContaining(["/api/billing", "/api/employees/manage"]),
    );
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("starts only the portal's dashboard for a Gridmaster, who has no organization shell", async () => {
    primeSignInQueries(queryClient, token({ platform_role: "gridmaster", org_id: ORG_ID }));

    await waitFor(() => expect(requestedPaths()).toEqual(["/api/gridmaster/dashboard"]));
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.gridmaster.dashboard())?.status).toBe("success"),
    );
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
    mockPathname = "/dashboard";
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

  it("primes a cold page load once, from the session the server vouched for", async () => {
    mockTransitionPending = false;
    const { rerender } = renderPrefetch();

    await waitFor(() => expect(requestedPaths()).toContain("/api/employees/manage"));
    const requests = vi.mocked(fetch).mock.calls.length;
    mockSession = { access_token: token({ org_id: ORG_ID, org_role: "user", iat: 2 }) };
    rerender(
      <QueryClientProvider client={queryClient}>
        <SignInPrefetch />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(fetch).mock.calls.length).toBe(requests);
  });

  it("leaves the roster alone on a cold load of another page", async () => {
    mockTransitionPending = false;
    mockPathname = "/schedule";
    renderPrefetch();

    await waitFor(() => expect(requestedPaths()).toContain("/api/organization/bootstrap"));
    expect(requestedPaths()).not.toContain("/api/employees/manage");
  });

  it("stays out of the sign-in pages", () => {
    mockTransitionPending = false;
    mockPathname = "/login";
    renderPrefetch();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for a session", () => {
    mockSession = null;
    renderPrefetch();
    expect(fetch).not.toHaveBeenCalled();
  });
});
