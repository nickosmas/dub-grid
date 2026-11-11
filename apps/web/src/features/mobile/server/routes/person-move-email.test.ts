import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileSensitiveActionAuth = vi.fn();
const loadMobilePersonWithAccess = vi.fn();
const moveStaffRecordToNewEmail = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileSensitiveActionAuth }));
vi.mock("@/features/mobile/server/person-access", () => ({ loadMobilePersonWithAccess }));
vi.mock("@/features/mobile/server/management-roster", () => ({
  getRequestIp: () => "203.0.113.9",
}));
vi.mock("@/features/employees/server/move-email", () => ({ moveStaffRecordToNewEmail }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

const ORG_ID = "2f8a4b6e-0a8d-4a58-9d3a-0f6f1f0a1b11";
const EMP_ID = "d660d308-4e0d-4daf-84fd-6753405e6740";
const ACTOR_ID = "a1111111-1111-4111-8111-111111111111";
const INVITATION_ID = "c3333333-3333-4333-8333-333333333333";

const movedPerson = {
  id: EMP_ID,
  employeeNumber: 1042,
  firstName: "Mina",
  lastName: "Diaz",
  employmentType: "full_time",
  phone: "",
  email: "new@dubgrid.test",
  status: "active",
  orgRole: null,
  certificationId: null,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [2],
  departmentIds: [],
  deptAdminIds: [],
  managementDepartmentIds: [],
  managementDeptAdminIds: [],
  contactNotes: "",
  statusChangedAt: null,
  statusNote: "",
  userId: null,
  version: 4,
  membershipUpdatedAt: null,
  pendingInvitation: {
    id: INVITATION_ID,
    email: "new@dubgrid.test",
    expiresAt: "2026-11-18T00:00:00.000Z",
    updatedAt: null,
    roleToAssign: "user",
  },
};

function makeAuth(permissions: Record<string, boolean> = {}) {
  return {
    user: { id: ACTOR_ID, email: "manager@dubgrid.test" },
    currentOrg: { id: ORG_ID },
    serviceClient: { tag: "service" },
    permissions: {
      canManageEmployees: true,
      isSuperAdmin: false,
      isGridmaster: false,
      ...permissions,
    },
  };
}

function request(body: unknown = { email: "new@dubgrid.test", expectedVersion: 3 }) {
  return new NextRequest(`http://localhost/api/mobile/v1/people/${EMP_ID}/move-email`, {
    method: "POST",
    headers: { "user-agent": "DubGrid/1.0" },
    body: JSON.stringify(body),
  });
}

async function post(body?: unknown) {
  const { POST } = await import("./person-move-email");
  return POST(request(body), { params: Promise.resolve({ id: EMP_ID }) });
}

describe("POST /api/mobile/v1/people/[id]/move-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileSensitiveActionAuth.mockResolvedValue(makeAuth());
    moveStaffRecordToNewEmail.mockResolvedValue({
      employee: { id: EMP_ID, email: "new@dubgrid.test", userId: null, version: 4 },
      invited: true,
    });
    loadMobilePersonWithAccess.mockResolvedValue({ person: movedPerson });
  });

  it("asks for fresh proof before anything else", async () => {
    requireMobileSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json(
        { error: "Confirm your identity", code: "STEP_UP_REQUIRED" },
        { status: 403 },
      ),
    });

    const response = await post();

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
    expect(moveStaffRecordToNewEmail).not.toHaveBeenCalled();
  });

  it("refuses someone who can't manage staff", async () => {
    requireMobileSensitiveActionAuth.mockResolvedValue(makeAuth({ canManageEmployees: false }));

    const response = await post();

    expect(response.status).toBe(403);
    expect(moveStaffRecordToNewEmail).not.toHaveBeenCalled();
  });

  it("refuses a body without an email or version", async () => {
    const response = await post({ email: "" });

    expect(response.status).toBe(400);
    expect(moveStaffRecordToNewEmail).not.toHaveBeenCalled();
  });

  it("moves them in the token's organization and answers with their page", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      person: movedPerson,
      invited: true,
    });
    expect(moveStaffRecordToNewEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        empId: EMP_ID,
        email: "new@dubgrid.test",
        expectedVersion: 3,
        actor: { id: ACTOR_ID, email: "manager@dubgrid.test" },
        requestContext: { ipAddress: "203.0.113.9", userAgent: "DubGrid/1.0" },
      }),
    );
    expect(loadMobilePersonWithAccess).toHaveBeenCalledWith({ tag: "service" }, ORG_ID, EMP_ID);
  });

  it("says when the invite didn't send", async () => {
    moveStaffRecordToNewEmail.mockResolvedValue({
      employee: { id: EMP_ID, email: "new@dubgrid.test", userId: null, version: 4 },
      invited: false,
    });

    const response = await post();

    expect((await response.json()).invited).toBe(false);
  });

  it("lets only a Super Admin hand out Admin access", async () => {
    await post();
    const admin = moveStaffRecordToNewEmail.mock.calls[0][0];
    expect(await admin.canGrantElevatedRoles()).toBe(false);

    requireMobileSensitiveActionAuth.mockResolvedValue(makeAuth({ isSuperAdmin: true }));
    await post();
    const superAdmin = moveStaffRecordToNewEmail.mock.calls[1][0];
    expect(await superAdmin.canGrantElevatedRoles()).toBe(true);
  });

  it("passes the shared move's refusal through unchanged", async () => {
    moveStaffRecordToNewEmail.mockResolvedValue({
      response: NextResponse.json(
        { error: "Only a Super Admin can move an Admin or Super Admin." },
        { status: 403 },
      ),
    });

    const response = await post();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Only a Super Admin can move an Admin or Super Admin.",
    );
    expect(loadMobilePersonWithAccess).not.toHaveBeenCalled();
  });

  it("says the move stood when their page can't be reloaded", async () => {
    loadMobilePersonWithAccess.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      "They were moved, but we couldn't show it here. Open their page again.",
    );
  });
});
