import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const requireMobileSensitiveActionAuth = vi.fn();
const listAdminProfileChangeRequests = vi.fn();
const fetchProfileChangeRequestForResolution = vi.fn();
const resolveProfileChangeRequest = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  requireMobileSensitiveActionAuth,
}));
vi.mock("@/features/account/server", () => ({
  cancelOwnProfileChangeRequest: vi.fn(),
  createProfileChangeRequest: vi.fn(),
  fetchProfileChangeRequestForResolution: (...args: unknown[]) =>
    fetchProfileChangeRequestForResolution(...args),
  listAdminProfileChangeRequests: (...args: unknown[]) => listAdminProfileChangeRequests(...args),
  listOwnProfileChangeRequests: vi.fn(),
  resolveProfileChangeRequest: (...args: unknown[]) => resolveProfileChangeRequest(...args),
}));

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function authFor(permissions: Record<string, boolean>) {
  return {
    user: { id: "actor" },
    currentOrg: { id: "org-1" },
    serviceClient: {},
    permissions,
  };
}

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/mobile/v1/profile/change-requests/${REQUEST_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mobile profile change requests route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminProfileChangeRequests.mockResolvedValue([]);
    resolveProfileChangeRequest.mockResolvedValue({ id: REQUEST_ID });
  });

  it("hides account deletions from managers who are not super admins", async () => {
    requireMobileAuth.mockResolvedValue(
      authFor({ canManageEmployees: true, isSuperAdmin: false, isGridmaster: false }),
    );
    const { GET } = await import("./profile-change-requests");

    await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/profile/change-requests?scope=admin"),
    } as never);

    expect(listAdminProfileChangeRequests).toHaveBeenCalledWith(
      expect.objectContaining({ includeAccountDeletion: false }),
    );
  });

  it("refuses a manager's decision on an account deletion", async () => {
    requireMobileAuth.mockResolvedValue(
      authFor({ canManageEmployees: true, isSuperAdmin: false, isGridmaster: false }),
    );
    fetchProfileChangeRequestForResolution.mockResolvedValue({ type: "account_deletion" });
    const { PATCH } = await import("./profile-change-requests");

    const response = await PATCH(patchRequest({ action: "approve" }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(response.status).toBe(403);
    expect(resolveProfileChangeRequest).not.toHaveBeenCalled();
  });

  it("asks a super admin for fresh credentials before approving a deletion", async () => {
    requireMobileAuth.mockResolvedValue(
      authFor({ canManageEmployees: true, isSuperAdmin: true, isGridmaster: false }),
    );
    fetchProfileChangeRequestForResolution.mockResolvedValue({ type: "account_deletion" });
    requireMobileSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ error: "STEP_UP_REQUIRED" }, { status: 403 }),
    });
    const { PATCH } = await import("./profile-change-requests");

    const response = await PATCH(patchRequest({ action: "approve" }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "STEP_UP_REQUIRED" });
    expect(resolveProfileChangeRequest).not.toHaveBeenCalled();
  });

  it("lets a manager decide a profile update without step-up", async () => {
    requireMobileAuth.mockResolvedValue(
      authFor({ canManageEmployees: true, isSuperAdmin: false, isGridmaster: false }),
    );
    fetchProfileChangeRequestForResolution.mockResolvedValue({ type: "profile_update" });
    const { PATCH } = await import("./profile-change-requests");

    await PATCH(patchRequest({ action: "approve" }), {
      params: Promise.resolve({ id: REQUEST_ID }),
    });

    // The stubbed record fails the response schema; the gate is what matters here.
    expect(requireMobileSensitiveActionAuth).not.toHaveBeenCalled();
    expect(resolveProfileChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, action: "approve" }),
    );
  });
});
