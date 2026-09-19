import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireOrgPermissions = vi.fn();
const platformFrom = vi.fn();
const orgFrom = vi.fn();
const fetchFilteredAuditRows = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (
    req: NextRequest,
    orgId: string,
    isAllowed: (permissions: Record<string, boolean>) => boolean,
  ) => requireOrgPermissions(req, orgId, isAllowed),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: platformFrom,
  }),
}));

vi.mock("@/lib/audit/server-query", () => ({
  fetchFilteredAuditRows: (...args: unknown[]) => fetchFilteredAuditRows(...args),
}));

import { GET } from "./route";
import { ORG_AUDIENCE_ACTIONS } from "@/lib/audit/registry";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    org_id: ORG_ID,
    actor_id: ACTOR_ID,
    actor_email: "admin@example.com",
    action: "employee.updated",
    resource_type: "employee",
    resource_id: EMPLOYEE_ID,
    details: { field: "name" },
    created_at: "2026-05-01T15:00:00.000Z",
    ...overrides,
  };
}

function makeAuditQuery(rows = [makeAuditRow()]) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    eq: vi.fn(() => query),
    like: vi.fn(() => query),
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject: (reason?: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return query;
}

function makeInQuery(rows: Record<string, unknown>[]) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return query;
}

function makeAuditClientFrom() {
  return vi.fn((table: string) => {
    if (table === "audit_log") {
      return makeAuditQuery();
    }
    if (table === "profiles") {
      return makeInQuery([
        {
          id: ACTOR_ID,
          first_name: "Jordan",
          last_name: "Admin",
        },
      ]);
    }
    if (table === "employees") {
      return makeInQuery([
        {
          id: EMPLOYEE_ID,
          first_name: "Alexandra",
          last_name: "Stone",
          email: "alexandra@example.com",
        },
      ]);
    }
    if (table === "invitations") {
      return makeInQuery([]);
    }
    if (table === "organizations") {
      return makeInQuery([
        {
          id: ORG_ID,
          name: "Arden Wood",
        },
      ]);
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/gridmaster/audit-log/full", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    platformFrom.mockImplementation(makeAuditClientFrom());
    orgFrom.mockImplementation(makeAuditClientFrom());
    fetchFilteredAuditRows.mockResolvedValue([makeAuditRow()]);

    requireGridmasterSession.mockResolvedValue({
      session: { access_token: "token" },
      user: { id: "gridmaster-user" },
    });
    requireOrgPermissions.mockImplementation(
      async (
        _req: NextRequest,
        _orgId: string,
        isAllowed: (permissions: Record<string, boolean>) => boolean,
      ) => {
        const permissions = {
          isGridmaster: false,
          isSuperAdmin: true,
          canManageEmployees: false,
        };
        if (!isAllowed(permissions)) {
          return {
            response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
          };
        }
        return {
          actor: { id: "super-admin-user" },
          permissions,
          serviceClient: { from: orgFrom },
          userClient: {},
        };
      },
    );
  });

  it("allows org super admins to load their org-scoped activity log", async () => {
    const response = await GET(
      makeRequest(
        `http://localhost/api/gridmaster/audit-log/full?orgId=${ORG_ID}&limit=25&actionPrefix=employee.`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries: [
        {
          id: 42,
          orgId: ORG_ID,
          orgName: "Arden Wood",
          actorId: ACTOR_ID,
          actorEmail: "admin@example.com",
          actorName: "Jordan Admin",
          action: "employee.updated",
          resourceType: "employee",
          resourceId: EMPLOYEE_ID,
          targetLabel: "Alexandra Stone",
          targetEmail: "alexandra@example.com",
          details: { field: "name" },
          createdAt: "2026-05-01T15:00:00.000Z",
        },
      ],
    });
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      ORG_ID,
      expect.any(Function),
    );
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(fetchFilteredAuditRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: ORG_ID,
        actionPrefix: "employee.",
        // An organization's own admin reads through the org allowlist.
        actionPrefixes: [...ORG_AUDIENCE_ACTIONS],
      }),
    );
  });

  it("narrows an org admin's category filter to org-visible actions", async () => {
    await GET(
      makeRequest(
        `http://localhost/api/gridmaster/audit-log/full?orgId=${ORG_ID}&actionPrefixes=billing.`,
      ),
    );

    const [, filters] = fetchFilteredAuditRows.mock.calls[0] as [
      unknown,
      { actionPrefixes: string[] },
    ];
    expect(filters.actionPrefixes).toContain("billing.payment_failed");
    expect(filters.actionPrefixes).not.toContain("billing.portal_opened");
    expect(filters.actionPrefixes).not.toContain("billing.seats_synced");
    expect(filters.actionPrefixes.every((action) => action.startsWith("billing."))).toBe(true);
  });

  it("returns nothing to an org admin asking for a platform-only category", async () => {
    const response = await GET(
      makeRequest(
        `http://localhost/api/gridmaster/audit-log/full?orgId=${ORG_ID}&actionPrefixes=impersonation.`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entries: [] });
    expect(fetchFilteredAuditRows).not.toHaveBeenCalled();
  });

  it("passes a gridmaster's org-scoped prefixes through untouched", async () => {
    requireOrgPermissions.mockImplementationOnce(async () => ({
      actor: { id: "gridmaster-user" },
      permissions: { isGridmaster: true, isSuperAdmin: false, canManageEmployees: false },
      serviceClient: { from: orgFrom },
      userClient: {},
    }));

    await GET(
      makeRequest(
        `http://localhost/api/gridmaster/audit-log/full?orgId=${ORG_ID}&actionPrefixes=impersonation.,security.`,
      ),
    );

    expect(fetchFilteredAuditRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionPrefixes: ["impersonation.", "security."] }),
    );
  });

  it("keeps unscoped full audit log access platform-gridmaster only", async () => {
    const response = await GET(
      makeRequest("http://localhost/api/gridmaster/audit-log/full?limit=25"),
    );

    expect(response.status).toBe(200);
    expect(requireGridmasterSession).toHaveBeenCalledTimes(1);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(fetchFilteredAuditRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 25 }),
    );
  });

  it("rejects org-scoped activity requests when org permissions are insufficient", async () => {
    requireOrgPermissions.mockImplementationOnce(
      async (
        _req: NextRequest,
        _orgId: string,
        isAllowed: (permissions: Record<string, boolean>) => boolean,
      ) => {
        const permissions = {
          isGridmaster: false,
          isSuperAdmin: false,
          canManageEmployees: false,
        };
        if (!isAllowed(permissions)) {
          return {
            response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }),
          };
        }
        throw new Error("Unexpected authorization success");
      },
    );

    const response = await GET(
      makeRequest(`http://localhost/api/gridmaster/audit-log/full?orgId=${ORG_ID}`),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Insufficient permissions",
    });
    expect(orgFrom).not.toHaveBeenCalled();
  });
});
