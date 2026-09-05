import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const checkEmployeeEmailConflict = vi.fn();
const checkEmployeePhoneConflict = vi.fn();
const loggerError = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));

vi.mock("@/features/employees/server/contact-conflicts", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/employees/server/contact-conflicts")
  >("@/features/employees/server/contact-conflicts");
  return {
    checkEmployeeEmailConflict,
    checkEmployeePhoneConflict,
    EmployeeContactLookupError: actual.EmployeeContactLookupError,
  };
});

vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: loggerError } }));

const ORG_ID = "44444444-4444-4444-8444-444444444444";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function mockAuth(overrides: Record<string, unknown> = {}) {
  requireMobileAuth.mockResolvedValue({
    currentOrg: { id: ORG_ID, name: "Calm Haven" },
    permissions: { canManageEmployees: true, canManageUsers: true },
    serviceClient: {},
    user: { id: "55555555-5555-4555-8555-555555555555", email: "admin@example.com" },
    ...overrides,
  });
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/mobile/v1/people/contact-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("mobile people contact-check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    checkEmployeeEmailConflict.mockResolvedValue({ conflict: false, conflictingEmployeeId: null });
    checkEmployeePhoneConflict.mockResolvedValue({ conflict: false, conflictingEmployeeId: null });
  });

  it("refuses callers who can't manage staff", async () => {
    mockAuth({ permissions: { canManageEmployees: false, canManageUsers: false } });

    const { POST } = await import("./people-contact-check");
    const response = await POST(makeRequest({ email: "mina@example.com" }));

    expect(response.status).toBe(403);
    expect(checkEmployeeEmailConflict).not.toHaveBeenCalled();
  });

  it("reports a duplicate employee email", async () => {
    checkEmployeeEmailConflict.mockResolvedValue({
      conflict: true,
      conflictingEmployeeId: EMPLOYEE_ID,
      reason: "employee_duplicate",
    });

    const { POST } = await import("./people-contact-check");
    const response = await POST(makeRequest({ email: "mina@example.com" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.email).toEqual({
      conflict: true,
      conflictingEmployeeId: EMPLOYEE_ID,
      reason: "employee_duplicate",
    });
    expect(payload.phone).toBeNull();
  });

  // The org must come from the session, never the body: a sandboxed caller has
  // to be checked against the clone they are actually editing.
  it("checks against the caller's effective org and passes the exemptions through", async () => {
    const { POST } = await import("./people-contact-check");
    await POST(
      makeRequest({
        email: "mina@example.com",
        phone: "(555) 010-0100",
        excludeEmployeeId: EMPLOYEE_ID,
        currentUserId: USER_ID,
      }),
    );

    expect(checkEmployeeEmailConflict).toHaveBeenCalledWith(
      {},
      {
        orgId: ORG_ID,
        email: "mina@example.com",
        excludeEmployeeId: EMPLOYEE_ID,
        currentUserId: USER_ID,
      },
    );
    expect(checkEmployeePhoneConflict).toHaveBeenCalledWith(
      {},
      { orgId: ORG_ID, phone: "(555) 010-0100", excludeEmployeeId: EMPLOYEE_ID },
    );
  });

  it("skips a check for a field that wasn't sent", async () => {
    const { POST } = await import("./people-contact-check");
    const response = await POST(makeRequest({ phone: "5550100" }));
    const payload = await response.json();

    expect(checkEmployeeEmailConflict).not.toHaveBeenCalled();
    expect(payload.email).toBeNull();
    expect(payload.phone).toEqual({ conflict: false, conflictingEmployeeId: null });
  });

  it("answers 500 when a lookup fails rather than leaking the query error", async () => {
    const { EmployeeContactLookupError } =
      await import("@/features/employees/server/contact-conflicts");
    checkEmployeeEmailConflict.mockRejectedValue(
      new EmployeeContactLookupError("lookup failed", new Error("boom")),
    );

    const { POST } = await import("./people-contact-check");
    const response = await POST(makeRequest({ email: "mina@example.com" }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("We couldn't check those details. Try again.");
    expect(loggerError).toHaveBeenCalled();
  });
});
