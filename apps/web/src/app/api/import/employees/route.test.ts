import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedSession = vi.fn();
const requireOrgPermissions = vi.fn();
const checkRateLimit = vi.fn();
const isFeatureEnabled = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function request(rows: unknown[]) {
  return new NextRequest("http://localhost/api/import/employees", {
    method: "POST",
    body: JSON.stringify({ orgId: ORG_ID, rows }),
  });
}

function createServiceClient() {
  const employeeInserts = vi.fn().mockResolvedValue({ error: null });
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const lookupData: Record<string, unknown[]> = {
    focus_areas: [{ id: 1, name: "Skilled Nursing" }],
    certifications: [],
    organization_roles: [],
  };

  const fromTables: Record<string, { eq: ReturnType<typeof vi.fn> }> = {};

  return {
    employeeInserts,
    auditInsert,
    fromTables,
    serviceClient: {
      from(table: string) {
        if (table === "employees") {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            order: vi.fn(() => query),
            limit: vi.fn(() => query),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: employeeInserts,
          };
          return query;
        }
        if (table === "audit_log") return { insert: auditInsert };

        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            return Promise.resolve({ data: lookupData[table], error: null }).then(
              onfulfilled,
              onrejected,
            );
          },
        };
        fromTables[table] = query;
        return query;
      },
    },
  };
}

describe("POST /api/import/employees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedSession.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
    });
    checkRateLimit.mockResolvedValue({ limited: false, reset: null, misconfigured: false });
    isFeatureEnabled.mockResolvedValue(true);
  });

  it("rejects an invalid focus area row and imports the remaining valid rows", async () => {
    const { serviceClient, employeeInserts } = createServiceClient();
    requireOrgPermissions.mockResolvedValue({ serviceClient, orgId: ORG_ID });

    const response = await POST(
      request([
        { firstName: "Emily", lastName: "Carter", focusAreaNames: "Skilled Nursing" },
        { firstName: "Grace", lastName: "Thompson", focusAreaNames: "Rehab Wing" },
      ]),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      inserted: 1,
      total: 2,
      errors: [{ row: 2, error: 'Unknown focus area: "Rehab Wing"' }],
    });
    expect(employeeInserts).toHaveBeenCalledTimes(1);
    expect(employeeInserts).toHaveBeenCalledWith([
      expect.objectContaining({ first_name: "Emily", last_name: "Carter", focus_area_ids: [1] }),
    ]);
  });

  it("imports into the effective organization when the caller is inside a sandbox", async () => {
    const { serviceClient, employeeInserts, auditInsert, fromTables } = createServiceClient();
    // Authorization redirected the caller to their sandbox: only that id was checked.
    requireOrgPermissions.mockResolvedValue({ serviceClient, orgId: SANDBOX_ORG_ID });

    const response = await POST(
      request([{ firstName: "Emily", lastName: "Carter", focusAreaNames: "Skilled Nursing" }]),
    );

    expect(response.status).toBe(200);
    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      expect.any(Function),
      expect.anything(),
    );
    expect(employeeInserts).toHaveBeenCalledWith([
      expect.objectContaining({ org_id: SANDBOX_ORG_ID }),
    ]);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ org_id: SANDBOX_ORG_ID }));
    for (const table of ["focus_areas", "certifications", "organization_roles"]) {
      expect(fromTables[table].eq).toHaveBeenCalledWith("org_id", SANDBOX_ORG_ID);
      expect(fromTables[table].eq).not.toHaveBeenCalledWith("org_id", ORG_ID);
    }
  });
});
