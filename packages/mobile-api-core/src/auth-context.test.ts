import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileApiRequestError, resolveMobileAuthContext, type MobileAuthClaims } from "./auth";
import { resetMobileOrgSetupCompleteMemo } from "./setup";

const USER_ID = "user-1";
const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ORG_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type OrgRow = {
  id: string;
  archivedAt: string | null;
  suspendedAt: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  billingPolicyOverrides: null;
  billingPausedAt: string | null;
  paymentGraceStartedAt: string | null;
};

function orgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: ORG_ID,
    archivedAt: null,
    suspendedAt: null,
    subscriptionStatus: "active",
    trialEndsAt: null,
    billingPolicyOverrides: null,
    billingPausedAt: null,
    paymentGraceStartedAt: null,
    ...overrides,
  };
}

function membershipRow(orgId: string) {
  return {
    user_id: USER_ID,
    org_role: "admin",
    admin_permissions: null,
    joined_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    department_ids: [],
    dept_admin_ids: [],
    organization: { id: orgId, name: "Calm Haven", slug: "calm-haven" },
  };
}

function setupTables(complete: boolean): Record<string, { data: unknown[]; count?: number }> {
  return {
    focus_areas: { data: complete ? [{ id: 1, department_id: 10, archived_at: null }] : [] },
    shift_categories: { data: complete ? [{ id: 2, focus_area_id: 1, archived_at: null }] : [] },
    jobs: {
      data: complete
        ? [{ assignment_mode: "shiftless", show_on_grid: true, archived_at: null }]
        : [],
    },
    certifications: { data: complete ? [{ id: 4, archived_at: null }] : [] },
    organization_roles: { data: complete ? [{ id: 5, archived_at: null }] : [] },
    departments: { data: complete ? [{ id: 10, type: "scheduled", archived_at: null }] : [] },
    employees: { data: [], count: complete ? 1 : 0 },
  };
}

/** A query chain that answers every filter with itself and resolves to the table's rows. */
function buildServiceClient(input: {
  factors?: Array<{ factor_type: string; status: string }>;
  setupComplete?: boolean;
  employeeStatus?: string;
}) {
  const tables = setupTables(input.setupComplete ?? true);
  const from = vi.fn((table: string) => {
    const result = { error: null, ...tables[table] };
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({
        data: { status: input.employeeStatus ?? "active" },
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  });
  const getUser = vi.fn(async () => ({
    data: { user: { id: USER_ID, factors: input.factors ?? [] } },
    error: null,
  }));
  return { client: { from, auth: { getUser } } as unknown as SupabaseClient, from, getUser };
}

function buildInput(options: {
  claims?: MobileAuthClaims;
  platformRole?: string | null;
  memberships?: ReturnType<typeof membershipRow>[];
  organization?: OrgRow | null;
  revoked?: boolean;
  factors?: Array<{ factor_type: string; status: string }>;
  setupComplete?: boolean;
  employeeStatus?: string;
}) {
  const service = buildServiceClient(options);
  const deps = {
    verifyToken: vi.fn(async () => ({
      userId: USER_ID,
      sessionId: "session-1",
      issuedAtMs: 1,
      claims: options.claims ?? { org_id: ORG_ID, aal: "aal1" },
    })),
    isRevoked: vi.fn(async () => options.revoked ?? false),
    fetchPlatformRole: vi.fn(async () => (options.platformRole ?? "none") as "none"),
    fetchMemberships: vi.fn(async () => options.memberships ?? [membershipRow(ORG_ID)]),
    fetchOrganization: vi.fn(async () =>
      options.organization === undefined ? orgRow() : options.organization,
    ),
    loadPlatformBillingPolicy: vi.fn(async () => undefined as never),
  };
  return {
    service,
    deps,
    input: {
      accessToken: "token",
      serviceClient: service.client,
      createUserClient: () => ({}) as SupabaseClient,
      mapOrganization: (row: OrgRow) => row,
      ...deps,
    },
  };
}

async function refusal(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(MobileApiRequestError);
  const { status, message } = error as MobileApiRequestError;
  return { status, message };
}

const TOTP = [{ factor_type: "totp", status: "verified" }];

describe("resolveMobileAuthContext decisions", () => {
  beforeEach(() => {
    resetMobileOrgSetupCompleteMemo();
  });

  it("admits an active member of a complete, paid organization", async () => {
    const { input } = buildInput({});
    const context = await resolveMobileAuthContext(input);
    expect(context.currentOrg.id).toBe(ORG_ID);
    expect(context.membership?.orgRole).toBe("admin");
  });

  it.each([
    ["a revoked session", { revoked: true }, 401, "Invalid session"],
    [
      "aal1 with a verified TOTP factor",
      { factors: TOTP },
      401,
      "Two-factor authentication required",
    ],
    [
      "a Gridmaster",
      { platformRole: "gridmaster" },
      403,
      "Gridmaster mobile access is not supported",
    ],
    [
      "no membership",
      { memberships: [] },
      403,
      "You're no longer in an organization. Ask an Admin if that's a mistake.",
    ],
    [
      "no org claim",
      { claims: { aal: "aal1" } },
      403,
      "Your session is not tied to an organization. Sign in again to pick one.",
    ],
    [
      "an org claim the user is not a member of",
      { memberships: [membershipRow(OTHER_ORG_ID)] },
      403,
      "You're no longer in this organization. Sign in again to pick another.",
    ],
    ["a missing organization", { organization: null }, 404, "Organization not found"],
    [
      "an archived organization",
      { organization: orgRow({ archivedAt: "2026-01-01T00:00:00.000Z" }) },
      403,
      "Organization unavailable. Try again later.",
    ],
    [
      "a billing-locked organization",
      { organization: orgRow({ suspendedAt: "2026-01-01T00:00:00.000Z" }) },
      403,
      "Organization unavailable. Try again later.",
    ],
    [
      "an organization mid-setup",
      { setupComplete: false },
      403,
      "Organization unavailable. Try again later.",
    ],
  ] as const)("refuses %s", async (_label, options, status, message) => {
    const { input } = buildInput(options as Parameters<typeof buildInput>[0]);
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({ status, message });
  });

  // Every refusal is checked in its original order: with several reasons to
  // refuse at once, the earliest check still gives the answer.
  it.each([
    [{ revoked: true, factors: TOTP, platformRole: "gridmaster" }, 401, "Invalid session"],
    [{ factors: TOTP, platformRole: "gridmaster" }, 401, "Two-factor authentication required"],
    [
      { platformRole: "gridmaster", memberships: [] },
      403,
      "Gridmaster mobile access is not supported",
    ],
    [
      { memberships: [], claims: { aal: "aal1" } },
      403,
      "You're no longer in an organization. Ask an Admin if that's a mistake.",
    ],
    [
      { memberships: [membershipRow(OTHER_ORG_ID)], organization: null },
      403,
      "You're no longer in this organization. Sign in again to pick another.",
    ],
    [
      {
        organization: orgRow({
          archivedAt: "2026-01-01T00:00:00.000Z",
          suspendedAt: "2026-01-01T00:00:00.000Z",
        }),
        setupComplete: false,
      },
      403,
      "Organization unavailable. Try again later.",
    ],
  ] as const)("keeps the earliest refusal (%#)", async (options, status, message) => {
    const { input } = buildInput(options as Parameters<typeof buildInput>[0]);
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({ status, message });
  });

  it("tells a super admin of a locked organization to manage billing on the web", async () => {
    const { input } = buildInput({
      memberships: [{ ...membershipRow(ORG_ID), org_role: "super_admin" }],
      organization: orgRow({ subscriptionStatus: "canceled" }),
    });
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({
      status: 403,
      message: "Organization unavailable. Sign in on the web to manage billing.",
    });
  });

  it("lets an earlier refusal win over a later read that fails", async () => {
    const { input, deps } = buildInput({ revoked: true });
    deps.fetchOrganization.mockRejectedValue(new Error("organization read failed"));
    deps.fetchMemberships.mockRejectedValue(new Error("membership read failed"));

    // An unhandled rejection from either read would fail this test run.
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({
      status: 401,
      message: "Invalid session",
    });
  });

  it("still surfaces a failed read once its turn comes", async () => {
    const { input, deps } = buildInput({});
    deps.fetchOrganization.mockRejectedValue(new Error("organization read failed"));
    await expect(resolveMobileAuthContext(input)).rejects.toThrow("organization read failed");
  });

  it("starts every independent read before the revocation answer arrives", async () => {
    const { input, deps, service } = buildInput({});
    let answerRevocation: (revoked: boolean) => void = () => {};
    deps.isRevoked.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          answerRevocation = resolve;
        }),
    );

    const pending = resolveMobileAuthContext(input);
    await vi.waitFor(() => expect(deps.isRevoked).toHaveBeenCalled());

    expect(service.getUser).toHaveBeenCalledWith("token");
    expect(deps.fetchPlatformRole).toHaveBeenCalledWith(service.client, USER_ID);
    expect(deps.fetchMemberships).toHaveBeenCalledWith(service.client, USER_ID);
    expect(deps.fetchOrganization).toHaveBeenCalledWith(service.client, ORG_ID);
    expect(deps.loadPlatformBillingPolicy).toHaveBeenCalled();
    expect(service.from).toHaveBeenCalledWith("focus_areas");
    expect(service.from).toHaveBeenCalledWith("employees");

    answerRevocation(false);
    await expect(pending).resolves.toMatchObject({ currentOrg: { id: ORG_ID } });
  });

  it("reads nothing for an organization when the token names none", async () => {
    const { input, deps, service } = buildInput({ claims: { aal: "aal1" } });
    await refusal(resolveMobileAuthContext(input));
    expect(deps.fetchOrganization).not.toHaveBeenCalled();
    expect(deps.loadPlatformBillingPolicy).not.toHaveBeenCalled();
    expect(service.from).not.toHaveBeenCalled();
  });

  it("reads nothing past verification for a token that fails it", async () => {
    const { input, deps, service } = buildInput({});
    deps.verifyToken.mockResolvedValue(null as never);
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({
      status: 401,
      message: "Invalid session",
    });
    expect(deps.isRevoked).not.toHaveBeenCalled();
    expect(service.getUser).not.toHaveBeenCalled();
    expect(deps.fetchMemberships).not.toHaveBeenCalled();
  });

  it("refuses when Auth names a different user than the verified token", async () => {
    const { input, service } = buildInput({});
    service.getUser.mockResolvedValue({
      data: { user: { id: "someone-else", factors: [] } },
      error: null,
    });
    expect(await refusal(resolveMobileAuthContext(input))).toEqual({
      status: 401,
      message: "Invalid session",
    });
  });

  it("keeps an inactive employee signed in with their role's permissions", async () => {
    const active = await resolveMobileAuthContext(buildInput({}).input);
    const context = await resolveMobileAuthContext(
      buildInput({ employeeStatus: "inactive" }).input,
    );
    expect(context.permissions.isInactive).toBe(true);
    expect(context.permissions.role).toBe("admin");
    expect({ ...context.permissions, isInactive: false }).toEqual(active.permissions);
  });
});
