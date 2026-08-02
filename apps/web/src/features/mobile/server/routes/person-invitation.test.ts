import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileEmployeeRowById = vi.fn();
const fetchMobilePendingInvitationRowByEmployeeId = vi.fn();
const createMobileEmployeeInvitationRow = vi.fn();
const refreshMobileEmployeeInvitationRow = vi.fn();
const revokeMobileEmployeeInvitationRow = vi.fn();
const insertMobileAuditLogEntry = vi.fn();
const rowToEmployee = vi.fn();
const sendResendEmail = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
}));

vi.mock("@dubgrid/data-access", () => ({
  createMobileEmployeeInvitationRow,
  fetchMobileEmployeeRowById,
  fetchMobilePendingInvitationRowByEmployeeId,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToEmployee,
}));

vi.mock("@/lib/resend", () => ({
  sendResendEmail,
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: loggerWarn, error: loggerError },
}));

const originalResendApiKey = process.env.RESEND_API_KEY;

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    employeeNumber: 1042,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "555-0100",
    email: "mina@example.com",
    status: "active",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [2],
    departmentIds: [4],
    deptAdminIds: [],
    contactNotes: "",
    statusChangedAt: null,
    statusNote: "",
    userId: null,
    version: 3,
    ...overrides,
  };
}

function makeServiceClient(input: {
  existingMemberUserId?: string | null;
  otherEmployees?: Array<{ id: string }>;
  profileName?: { first_name: string | null; last_name: string | null };
}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ error: null })),
    })),
  }));
  const from = vi.fn((table: string) => {
    if (table === "organization_memberships") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              data: input.existingMemberUserId ? [{ user_id: input.existingMemberUserId }] : [],
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({
              data: input.profileName ?? {
                first_name: "Mina",
                last_name: "Diaz",
              },
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === "employees") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  data: input.otherEmployees ?? [],
                  error: null,
                })),
              })),
            })),
          })),
        })),
        update,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    from,
    update,
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => ({
          data: {
            user: {
              id: userId,
              email: input.existingMemberUserId ? "mina@example.com" : null,
            },
          },
        })),
      },
    },
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/mobile/v1/people/11111111-1111-4111-8111-111111111111/invitation",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as never;
}

function makeContext() {
  return {
    params: Promise.resolve({
      id: "11111111-1111-4111-8111-111111111111",
    }),
  };
}

describe("mobile person invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "resend-test-key";
    fetchMobileEmployeeRowById.mockResolvedValue({ id: "employee-row" });
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(null);
    createMobileEmployeeInvitationRow.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      token: "invite-token",
      email: "mina@example.com",
      updated_at: null,
    });
    revokeMobileEmployeeInvitationRow.mockResolvedValue(null);
    rowToEmployee.mockReturnValue(makeEmployee());
    sendResendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalResendApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey;
    }
  });

  it("requires confirmation before linking an exact existing org member match", async () => {
    const serviceClient = makeServiceClient({
      existingMemberUserId: "33333333-3333-4333-8333-333333333333",
    });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });

    const { POST } = await import("./person-invitation");
    const response = await POST(makeRequest({ email: "mina@example.com" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "ACCOUNT_FOUND",
      details: {
        employeeFirstName: "Mina",
        employeeLastName: "Diaz",
        accountFirstName: "Mina",
        accountLastName: "Diaz",
      },
    });
    expect(serviceClient.update).not.toHaveBeenCalled();
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("links an existing org member after mobile confirmation", async () => {
    const serviceClient = makeServiceClient({
      existingMemberUserId: "33333333-3333-4333-8333-333333333333",
    });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });
    rowToEmployee
      .mockReturnValueOnce(makeEmployee())
      .mockReturnValueOnce(makeEmployee({ userId: "33333333-3333-4333-8333-333333333333" }));

    const { POST } = await import("./person-invitation");
    const response = await POST(
      makeRequest({ email: "mina@example.com", linkExistingAccount: true }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      result: "account_linked",
      person: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "33333333-3333-4333-8333-333333333333",
      },
    });
    expect(serviceClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("requires account confirmation before checking an existing account name mismatch", async () => {
    const serviceClient = makeServiceClient({
      existingMemberUserId: "33333333-3333-4333-8333-333333333333",
      profileName: { first_name: "Minnie", last_name: "Diaz" },
    });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });

    const { POST } = await import("./person-invitation");
    const response = await POST(makeRequest({ email: "mina@example.com" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "ACCOUNT_FOUND",
      details: {
        employeeFirstName: "Mina",
        employeeLastName: "Diaz",
        accountFirstName: "Minnie",
        accountLastName: "Diaz",
      },
    });
    expect(serviceClient.update).not.toHaveBeenCalled();
  });

  it("requires explicit reconciliation after confirming a different-name existing account", async () => {
    const serviceClient = makeServiceClient({
      existingMemberUserId: "33333333-3333-4333-8333-333333333333",
      profileName: { first_name: "Minnie", last_name: "Diaz" },
    });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });

    const { POST } = await import("./person-invitation");
    const response = await POST(
      makeRequest({ email: "mina@example.com", linkExistingAccount: true }),
      makeContext(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "NAME_MISMATCH",
      details: {
        employeeFirstName: "Mina",
        employeeLastName: "Diaz",
        accountFirstName: "Minnie",
        accountLastName: "Diaz",
      },
    });
    expect(serviceClient.update).not.toHaveBeenCalled();
  });

  it("reconciles the employee name when the mobile user confirms linking", async () => {
    const serviceClient = makeServiceClient({
      existingMemberUserId: "33333333-3333-4333-8333-333333333333",
      profileName: { first_name: "Minnie", last_name: "Diaz" },
    });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });
    rowToEmployee.mockReturnValueOnce(makeEmployee()).mockReturnValueOnce(
      makeEmployee({
        firstName: "Minnie",
        userId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    const { POST } = await import("./person-invitation");
    const response = await POST(
      makeRequest({
        email: "mina@example.com",
        linkExistingAccount: true,
        reconcileName: true,
      }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(serviceClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "Minnie",
        last_name: "Diaz",
        user_id: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(insertMobileAuditLogEntry).toHaveBeenCalledWith(
      serviceClient,
      expect.objectContaining({
        details: expect.objectContaining({
          linkedUserId: "33333333-3333-4333-8333-333333333333",
          nameReconciled: true,
        }),
      }),
    );
  });

  it("sends a mobile invitation to an unlinked employee", async () => {
    const serviceClient = makeServiceClient({ existingMemberUserId: null });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });
    rowToEmployee.mockReturnValueOnce(makeEmployee()).mockReturnValueOnce(
      makeEmployee({
        pendingInvitation: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "mina@example.com",
          expiresAt: "2026-05-05T00:00:00.000Z",
          updatedAt: null,
        },
      }),
    );
    fetchMobilePendingInvitationRowByEmployeeId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "22222222-2222-4222-8222-222222222222",
        email: "mina@example.com",
        expires_at: "2026-05-05T00:00:00.000Z",
        updated_at: null,
      });

    const { POST } = await import("./person-invitation");
    const response = await POST(makeRequest({ email: "mina@example.com" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      result: "invitation_sent",
      person: {
        id: "11111111-1111-4111-8111-111111111111",
        pendingInvitation: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "mina@example.com",
        },
      },
    });
    expect(createMobileEmployeeInvitationRow).toHaveBeenCalledWith(
      serviceClient,
      expect.objectContaining({
        employeeId: "11111111-1111-4111-8111-111111111111",
        email: "mina@example.com",
        roleToAssign: "user",
      }),
    );
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "resend-test-key",
        to: "mina@example.com",
      }),
    );
    expect(insertMobileAuditLogEntry).toHaveBeenCalledWith(
      serviceClient,
      expect.objectContaining({
        action: "invitation.created",
        resource_id: "22222222-2222-4222-8222-222222222222",
      }),
    );
  });

  it("does not create a mobile invitation when email delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const serviceClient = makeServiceClient({ existingMemberUserId: null });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });

    const { POST } = await import("./person-invitation");
    const response = await POST(makeRequest({ email: "mina@example.com" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: "Email service not configured" });
    expect(createMobileEmployeeInvitationRow).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("revokes a newly created mobile invitation when email sending fails", async () => {
    const serviceClient = makeServiceClient({ existingMemberUserId: null });
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Calm Haven",
      },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "admin@example.com",
      },
    });
    createMobileEmployeeInvitationRow.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      token: "invite-token",
      email: "mina@example.com",
      updated_at: "2026-05-02T21:30:00.000Z",
    });
    sendResendEmail.mockRejectedValue(new Error("Resend unavailable"));

    const { POST } = await import("./person-invitation");
    const response = await POST(makeRequest({ email: "mina@example.com" }), makeContext());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      error: "Invitation email could not be sent. Try again in a moment.",
    });
    expect(revokeMobileEmployeeInvitationRow).toHaveBeenCalledWith(serviceClient, {
      orgId: "44444444-4444-4444-8444-444444444444",
      invitationId: "22222222-2222-4222-8222-222222222222",
      expectedUpdatedAt: "2026-05-02T21:30:00.000Z",
    });
    expect(insertMobileAuditLogEntry).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "11111111-1111-4111-8111-111111111111",
        invitationId: "22222222-2222-4222-8222-222222222222",
      }),
      "Failed to send mobile invitation email",
    );
  });

  function makePatchRequest(body: Record<string, unknown>) {
    return new Request(
      "http://localhost/api/mobile/v1/people/11111111-1111-4111-8111-111111111111/invitation",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ) as never;
  }

  const PENDING_ROW = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "mina@example.com",
    expires_at: "2026-05-05T00:00:00.000Z",
    updated_at: "2026-05-02T21:30:00.000Z",
    employee_id: "11111111-1111-4111-8111-111111111111",
  };

  function setupResendAuth() {
    const serviceClient = makeServiceClient({ existingMemberUserId: null });
    requireMobileAuth.mockResolvedValue({
      currentOrg: { id: "44444444-4444-4444-8444-444444444444", name: "Calm Haven" },
      permissions: { canManageEmployees: true },
      serviceClient,
      user: { id: "55555555-5555-4555-8555-555555555555", email: "admin@example.com" },
    });
    return serviceClient;
  }

  it("does NOT mutate the invitation row when a resend email fails (retry stays clean)", async () => {
    setupResendAuth();
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(PENDING_ROW);
    sendResendEmail.mockRejectedValue(new Error("Resend unavailable"));

    const { PATCH } = await import("./person-invitation");
    const response = await PATCH(
      makePatchRequest({
        invitationId: PENDING_ROW.id,
        expectedUpdatedAt: PENDING_ROW.updated_at,
      }),
      makeContext(),
    );

    expect(response.status).toBe(502);
    // The row is only committed AFTER a successful send — so a failed send leaves it
    // untouched and the client's expectedUpdatedAt stays valid for a clean retry.
    expect(refreshMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });

  it("commits the exact token it emailed once the resend succeeds", async () => {
    setupResendAuth();
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(PENDING_ROW);
    sendResendEmail.mockResolvedValue(undefined);
    refreshMobileEmployeeInvitationRow.mockResolvedValue({
      ...PENDING_ROW,
      token: "committed-token",
      updated_at: "2026-05-02T22:00:00.000Z",
    });

    const { PATCH } = await import("./person-invitation");
    const response = await PATCH(
      makePatchRequest({
        invitationId: PENDING_ROW.id,
        expectedUpdatedAt: PENDING_ROW.updated_at,
      }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    // The token committed to the row must be the exact one embedded in the emailed link,
    // proving we emailed first and persisted that same token (not a separately-rotated one).
    const refreshArg = refreshMobileEmployeeInvitationRow.mock.calls[0][1];
    expect(refreshArg.invitationId).toBe(PENDING_ROW.id);
    expect(typeof refreshArg.token).toBe("string");
    expect(refreshArg.token.length).toBeGreaterThan(0);
    const emailedHtml = sendResendEmail.mock.calls[0][0].html as string;
    expect(emailedHtml).toContain(refreshArg.token);
  });

  it("409s a stale resend without emailing or mutating", async () => {
    setupResendAuth();
    fetchMobilePendingInvitationRowByEmployeeId.mockResolvedValue(PENDING_ROW);

    const { PATCH } = await import("./person-invitation");
    const response = await PATCH(
      makePatchRequest({
        invitationId: PENDING_ROW.id,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(refreshMobileEmployeeInvitationRow).not.toHaveBeenCalled();
  });
});
