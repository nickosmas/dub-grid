import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const requireMobileSensitiveActionAuth = vi.fn();
const updateUserById = vi.fn();
const fetchMobileEmployeeRowById = vi.fn();
const fetchMobileManagementMembershipRowsByUserIds = vi.fn();
const fetchMobilePendingInvitationRowByEmployeeId = vi.fn();
const updateMobileEmployeeDetailsRow = vi.fn();
const rowToEmployee = vi.fn();
const validateStaffOrgReferences = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  requireMobileSensitiveActionAuth,
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileEmployeeRowById,
  fetchMobileManagementMembershipRowsByUserIds,
  fetchMobilePendingInvitationRowByEmployeeId,
  updateMobileEmployeeDetailsRow,
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToEmployee,
}));

vi.mock("@/lib/staff-validation", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-validation")>("@/lib/staff-validation");
  return { ...actual, validateStaffOrgReferences };
});

const VIEWER_USER_ID = "3f1c5b7e-90ab-4c3d-8e2f-6a5b4c3d2e1f";
const PERSON_USER_ID = "8af6f242-c060-4920-a7db-91b4cb66fd26";

function makeAuth(overrides?: { canManageEmployees?: boolean; canViewStaff?: boolean }) {
  return {
    currentOrg: {
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    },
    user: {
      id: VIEWER_USER_ID,
    },
    permissions: {
      canManageEmployees: overrides?.canManageEmployees ?? true,
      canViewStaff: overrides?.canViewStaff ?? true,
    },
    serviceClient: { auth: { admin: { updateUserById } } },
  };
}

function mockManagementMemberships(rows: Array<{ user_id: string; department_ids: number[] }>) {
  fetchMobileManagementMembershipRowsByUserIds.mockImplementation(
    (_client: unknown, _orgId: string, userIds: string[]) =>
      Promise.resolve(
        rows
          .filter((row) => userIds.includes(row.user_id))
          .map((row) => ({ ...row, dept_admin_ids: row.department_ids })),
      ),
  );
}

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: "d660d308-4e0d-4daf-84fd-6753405e6740",
    employeeNumber: 1042,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "(415) 425-3334",
    email: "mina@dubgrid.com",
    status: "active",
    certificationId: null,
    roleIds: [3],
    seniority: 2,
    focusAreaIds: [2],
    departmentIds: [4],
    deptAdminIds: [5],
    contactNotes: "Weekend availability",
    statusChangedAt: "2026-04-24T12:00:00.000Z",
    statusNote: "Coverage hold",
    userId: PERSON_USER_ID,
    version: 7,
    ...overrides,
  };
}

describe("mobile person route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMobileEmployeeRowById.mockResolvedValue({
      id: "row-1",
      user_id: PERSON_USER_ID,
    });
    rowToEmployee.mockReturnValue(makeEmployee());
    mockManagementMemberships([{ user_id: PERSON_USER_ID, department_ids: [8] }]);
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(null);
    validateStaffOrgReferences.mockResolvedValue({});
    requireMobileSensitiveActionAuth.mockResolvedValue(makeAuth());
    updateUserById.mockResolvedValue({ error: null });
  });

  it("rejects users without staff visibility", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({
        canManageEmployees: false,
        canViewStaff: false,
      }),
    );

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view that staff profile.",
    });
  });

  it("returns a full person payload for managers", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth());
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "mina@dubgrid.com",
      expires_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.person).toMatchObject({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      contactNotes: "Weekend availability",
      managementDepartmentIds: [8],
      managementDeptAdminIds: [8],
      roleIds: [3],
      userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      pendingInvitation: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "mina@dubgrid.com",
      },
    });
  });

  it("does not return a person ID that is outside the authenticated organization", async () => {
    const auth = makeAuth();
    requireMobileAuth.mockResolvedValue(auth);
    fetchMobileEmployeeRowById.mockResolvedValue(null);

    const { GET } = await import("./person");
    const employeeId = "d660d308-4e0d-4daf-84fd-6753405e6740";
    const response = await GET(
      new Request(`http://localhost/api/mobile/v1/people/${employeeId}`) as never,
      { params: Promise.resolve({ id: employeeId }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Employee not found" });
    expect(fetchMobileEmployeeRowById).toHaveBeenCalledWith(
      auth.serviceClient,
      auth.currentOrg.id,
      employeeId,
    );
  });

  it("rejects management profiles for viewers without manage rights", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({ canManageEmployees: false, canViewStaff: true }),
    );

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view that staff profile.",
    });
  });

  it("sanitizes the person payload for regular users", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({ canManageEmployees: false, canViewStaff: true }),
    );
    mockManagementMemberships([]);
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "mina@dubgrid.com",
      expires_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.person).toMatchObject({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      contactNotes: "",
      departmentIds: [],
      deptAdminIds: [],
      managementDepartmentIds: [],
      managementDeptAdminIds: [],
      pendingInvitation: null,
      roleIds: [],
      statusNote: "",
      userId: null,
      // Personal contact details, withheld here exactly as the people list
      // already withholds them.
      email: "",
      phone: "",
    });
  });

  it("does not return the signed-in user's own employee through the person endpoint", async () => {
    requireMobileAuth.mockResolvedValue(
      makeAuth({ canManageEmployees: false, canViewStaff: true }),
    );
    rowToEmployee.mockReturnValue(makeEmployee({ userId: VIEWER_USER_ID }));
    mockManagementMemberships([]);

    const { GET } = await import("./person");
    const response = await GET(
      new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
      ) as never,
      {
        params: Promise.resolve({
          id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Employee not found" });
  });

  describe("PATCH", () => {
    function patchRequest(overrides: Record<string, unknown> = {}) {
      return new Request(
        "http://localhost/api/mobile/v1/people/d660d308-4e0d-4daf-84fd-6753405e6740",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: 7,
            firstName: "Mina",
            lastName: "Diaz",
            phone: "(415) 425-3334",
            email: "mina@dubgrid.com",
            contactNotes: "",
            employmentType: "full_time",
            certificationId: null,
            focusAreaIds: [],
            roleIds: [],
            departmentIds: [],
            ...overrides,
          }),
        },
      ) as never;
    }

    it("rejects clearing focus areas for a person with no management access", async () => {
      requireMobileAuth.mockResolvedValue(makeAuth());
      mockManagementMemberships([]);
      validateStaffOrgReferences.mockResolvedValueOnce({
        focusAreaIds: "Select at least one focus area",
      });

      const { PATCH } = await import("./person");
      const response = await PATCH(patchRequest(), {
        params: Promise.resolve({ id: "d660d308-4e0d-4daf-84fd-6753405e6740" }),
      });

      expect(response.status).toBe(400);
    });

    it("allows clearing focus areas for a person who also holds management access", async () => {
      requireMobileAuth.mockResolvedValue(makeAuth());
      mockManagementMemberships([{ user_id: PERSON_USER_ID, department_ids: [8] }]);
      updateMobileEmployeeDetailsRow.mockResolvedValue({ id: "row-1" });

      const { PATCH } = await import("./person");
      const response = await PATCH(patchRequest(), {
        params: Promise.resolve({ id: "d660d308-4e0d-4daf-84fd-6753405e6740" }),
      });

      expect(response.status).toBe(200);
    });

    it("records only a certification change with its before and after values", async () => {
      requireMobileAuth.mockResolvedValue(makeAuth());
      updateMobileEmployeeDetailsRow.mockResolvedValue({ id: "row-1" });

      const { PATCH } = await import("./person");
      const response = await PATCH(
        patchRequest({
          contactNotes: "Weekend availability",
          certificationId: 12,
          focusAreaIds: [2],
          roleIds: [3],
          departmentIds: [4],
        }),
        {
          params: Promise.resolve({ id: "d660d308-4e0d-4daf-84fd-6753405e6740" }),
        },
      );

      expect(response.status).toBe(200);
      expect(updateMobileEmployeeDetailsRow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          audit: expect.objectContaining({
            details: {
              changedFields: ["certification"],
              from: { certification: null },
              to: { certification: 12 },
            },
          }),
        }),
      );
    });

    it("authorizes a no-op save without writing an audit payload", async () => {
      requireMobileAuth.mockResolvedValue(makeAuth());
      updateMobileEmployeeDetailsRow.mockResolvedValue({ id: "row-1" });

      const { PATCH } = await import("./person");
      const response = await PATCH(
        patchRequest({
          contactNotes: "Weekend availability",
          focusAreaIds: [2],
          roleIds: [3],
          departmentIds: [4],
        }),
        {
          params: Promise.resolve({ id: "d660d308-4e0d-4daf-84fd-6753405e6740" }),
        },
      );

      expect(response.status).toBe(200);
      const input = updateMobileEmployeeDetailsRow.mock.calls[0]?.[1] as {
        audit: { actorId: string; details?: Record<string, unknown> };
      };
      expect(input.audit.actorId).toBe(VIEWER_USER_ID);
      expect(input.audit).not.toHaveProperty("details");
    });

    describe("login email", () => {
      const params = { params: Promise.resolve({ id: "d660d308-4e0d-4daf-84fd-6753405e6740" }) };

      it("changes the login email behind step-up before writing the row", async () => {
        requireMobileAuth.mockResolvedValue(makeAuth());
        updateMobileEmployeeDetailsRow.mockResolvedValue({ id: "row-1" });

        const { PATCH } = await import("./person");
        const response = await PATCH(patchRequest({ email: "new@dubgrid.com" }), params);

        expect(response.status).toBe(200);
        expect(requireMobileSensitiveActionAuth).toHaveBeenCalledTimes(1);
        expect(updateUserById).toHaveBeenCalledWith(PERSON_USER_ID, {
          email: "new@dubgrid.com",
          email_confirm: true,
        });
        expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
          updateMobileEmployeeDetailsRow.mock.invocationCallOrder[0]!,
        );
        const input = updateMobileEmployeeDetailsRow.mock.calls[0]?.[1] as {
          audit: { details?: { to: Record<string, unknown> } };
        };
        expect(input.audit.details?.to.loginEmail).toBe("new@dubgrid.com");
      });

      it("returns the step-up challenge without touching the account", async () => {
        requireMobileAuth.mockResolvedValue(makeAuth());
        requireMobileSensitiveActionAuth.mockResolvedValue({
          response: Response.json({ error: "step up" }, { status: 403 }),
        });

        const { PATCH } = await import("./person");
        const response = await PATCH(patchRequest({ email: "new@dubgrid.com" }), params);

        expect(response.status).toBe(403);
        expect(updateUserById).not.toHaveBeenCalled();
        expect(updateMobileEmployeeDetailsRow).not.toHaveBeenCalled();
      });

      it("skips step-up for a person without an account", async () => {
        requireMobileAuth.mockResolvedValue(makeAuth());
        rowToEmployee.mockReturnValue(makeEmployee({ userId: null }));
        mockManagementMemberships([]);
        updateMobileEmployeeDetailsRow.mockResolvedValue({ id: "row-1" });

        const { PATCH } = await import("./person");
        const response = await PATCH(
          patchRequest({ email: "new@dubgrid.com", focusAreaIds: [2] }),
          params,
        );

        expect(response.status).toBe(200);
        expect(requireMobileSensitiveActionAuth).not.toHaveBeenCalled();
        expect(updateUserById).not.toHaveBeenCalled();
      });

      it("reports a taken address as an email conflict", async () => {
        requireMobileAuth.mockResolvedValue(makeAuth());
        updateUserById.mockResolvedValue({
          error: { status: 422, code: "email_exists", message: "already registered" },
        });

        const { PATCH } = await import("./person");
        const response = await PATCH(patchRequest({ email: "taken@dubgrid.com" }), params);

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ field: "email" });
        expect(updateMobileEmployeeDetailsRow).not.toHaveBeenCalled();
      });

      it("rejects clearing the email of a linked account", async () => {
        requireMobileAuth.mockResolvedValue(makeAuth());

        const { PATCH } = await import("./person");
        const response = await PATCH(patchRequest({ email: "" }), params);

        expect(response.status).toBe(400);
        expect((await response.json()).fieldErrors.email).toBe(
          "An account needs an email to sign in with.",
        );
        expect(updateUserById).not.toHaveBeenCalled();
      });
    });
  });
});
