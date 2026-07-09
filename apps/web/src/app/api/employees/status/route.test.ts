import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "@dubgrid/client-errors";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const checkRateLimit = vi.fn();
const resolveEffectiveOrgId = vi.fn();
const isCallerInactive = vi.fn();
const membershipMaybeSingle = vi.fn();
const profileSingle = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
  isCallerInactive: (...args: unknown[]) => isCallerInactive(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: membershipMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: profileSingle,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const EMP_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest() {
  return new NextRequest("http://localhost/api/employees/status", {
    method: "POST",
    body: JSON.stringify({
      empId: EMP_ID,
      orgId: ORG_ID,
      action: "deactivate",
      expectedVersion: 1,
    }),
  });
}

describe("POST /api/employees/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    validateCsrfOrigin.mockReturnValue(null);
    resolveEffectiveOrgId.mockResolvedValue(ORG_ID);
  });

  it("denies an inactive admin from changing another employee's status even with canManageEmployees", async () => {
    isCallerInactive.mockResolvedValue(true);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: API_ERRORS.FORBIDDEN });
  });

  it("does not deny an inactive super_admin (bypass, matches account/permissions/route.ts)", async () => {
    isCallerInactive.mockResolvedValue(true);
    membershipMaybeSingle.mockResolvedValue({
      data: { org_role: "super_admin", admin_permissions: null },
      error: null,
    });
    profileSingle.mockResolvedValue({ data: { platform_role: "none" }, error: null });

    const response = await POST(makeRequest());

    // The permission gate lets a super_admin through regardless of `inactive`;
    // the mock has no "employees" table wired up for the row-fetch that follows,
    // so getting past the 403 surfaces as a 500 rather than a successful update.
    // That's enough to prove the gate itself did not block them.
    expect(response.status).not.toBe(403);
  });

  it("does not deny an inactive gridmaster (bypass, matches account/permissions/route.ts)", async () => {
    isCallerInactive.mockResolvedValue(true);
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileSingle.mockResolvedValue({ data: { platform_role: "gridmaster" }, error: null });

    const response = await POST(makeRequest());

    expect(response.status).not.toBe(403);
  });
});
