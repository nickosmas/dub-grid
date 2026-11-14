import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const requireOrgPermissions = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const buildOrganizationArchive = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: async () => ({ user: { id: "owner-1", email: "owner@example.com" } }),
  requireSensitiveActionAuth: (...args: unknown[]) => requireSensitiveActionAuth(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: async () => ({ limited: false, reset: 0, misconfigured: false }),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  fetchHiddenPeople: async () => ["internal-1"],
}));
vi.mock("@/features/organization/server/archive-export", () => ({
  archiveFilename: (slug: string) => `${slug}-dubgrid-export-2026-11-13.zip`,
  buildOrganizationArchive: (...args: unknown[]) => buildOrganizationArchive(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const serviceClient = {
  from: (table: string) =>
    table === "audit_log"
      ? { insert: (row: unknown) => auditInsert(row) }
      : {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { slug: "calmhaven" } }) }),
          }),
        },
};

const request = (orgId = ORG_ID) =>
  new NextRequest(`http://localhost/api/organizations/export?orgId=${orgId}`);

describe("GET /api/organizations/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissions.mockResolvedValue({ serviceClient, orgId: ORG_ID });
    requireSensitiveActionAuth.mockResolvedValue({ ok: true });
    buildOrganizationArchive.mockResolvedValue(new Uint8Array([80, 75, 5, 6]));
    auditInsert.mockResolvedValue({ error: null });
  });

  it("is for the organization's Super Admin only", async () => {
    await GET(request());

    const isAllowed = requireOrgPermissions.mock.calls[0]![2] as (p: object) => boolean;
    expect(isAllowed({ isSuperAdmin: true })).toBe(true);
    expect(isAllowed({ isSuperAdmin: false, canManageEmployees: true })).toBe(false);
  });

  it("asks for fresh proof before building anything", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(buildOrganizationArchive).not.toHaveBeenCalled();
  });

  it("sends the ZIP without hidden people and records the export", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="calmhaven-dubgrid-export-2026-11-13.zip"',
    );
    expect(buildOrganizationArchive).toHaveBeenCalledWith(serviceClient, ORG_ID, ["internal-1"]);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        action: "data.exported",
        resource_id: "organization_archive",
      }),
    );
  });

  it("refuses a malformed organization id", async () => {
    const response = await GET(request("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });
});
