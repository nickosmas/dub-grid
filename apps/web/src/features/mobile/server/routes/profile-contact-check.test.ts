import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const checkOwnContact = vi.fn();
const loggerError = vi.fn();

vi.mock("@/features/mobile/server", () => ({ requireMobileAuth }));

vi.mock("@/features/employees/server/contact-conflicts", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/employees/server/contact-conflicts")
  >("@/features/employees/server/contact-conflicts");
  return {
    checkOwnContact,
    EmployeeContactLookupError: actual.EmployeeContactLookupError,
  };
});

vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn(), error: loggerError } }));

const ORG_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const serviceClient = {};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/mobile/v1/profile/contact-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("mobile own contact-check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue({
      currentOrg: { id: ORG_ID, name: "Calm Haven" },
      permissions: { canManageEmployees: false },
      serviceClient,
      user: { id: USER_ID, email: "mina@example.com" },
    });
    checkOwnContact.mockResolvedValue({ emailTaken: false, phoneTaken: false });
  });

  it("checks the caller's own email and phone in their current organization", async () => {
    checkOwnContact.mockResolvedValue({ emailTaken: true, phoneTaken: false });

    const { POST } = await import("./profile-contact-check");
    const response = await POST(
      makeRequest({ email: " new@example.com ", phone: "(555) 123-4567" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailTaken: true, phoneTaken: false });
    expect(checkOwnContact).toHaveBeenCalledWith(serviceClient, {
      userId: USER_ID,
      orgId: ORG_ID,
      email: "new@example.com",
      phone: "(555) 123-4567",
    });
  });

  it("needs no staff permission: anyone may check their own details", async () => {
    const { POST } = await import("./profile-contact-check");
    const response = await POST(makeRequest({ phone: "5551234567" }));

    expect(response.status).toBe(200);
    expect(checkOwnContact).toHaveBeenCalledTimes(1);
  });

  it("skips an address the form would refuse", async () => {
    const { POST } = await import("./profile-contact-check");
    await POST(makeRequest({ email: "*@example.org", phone: "5551234567" }));

    expect(checkOwnContact).toHaveBeenCalledWith(serviceClient, {
      userId: USER_ID,
      orgId: ORG_ID,
      email: null,
      phone: "5551234567",
    });
  });

  it("answers the caller's sign-in refusal unchanged", async () => {
    const refusal = new Response(null, { status: 401 });
    requireMobileAuth.mockResolvedValue({ response: refusal });

    const { POST } = await import("./profile-contact-check");
    const response = await POST(makeRequest({ email: "new@example.com" }));

    expect(response).toBe(refusal);
    expect(checkOwnContact).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't an object", async () => {
    const { POST } = await import("./profile-contact-check");
    const response = await POST(makeRequest("new@example.com"));

    expect(response.status).toBe(400);
    expect(checkOwnContact).not.toHaveBeenCalled();
  });

  it("says the check failed without naming the lookup", async () => {
    const { EmployeeContactLookupError } =
      await import("@/features/employees/server/contact-conflicts");
    checkOwnContact.mockRejectedValue(new EmployeeContactLookupError("lookup failed", new Error()));

    const { POST } = await import("./profile-contact-check");
    const response = await POST(makeRequest({ email: "new@example.com" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "We couldn't check that. Try again." });
    expect(loggerError).toHaveBeenCalled();
  });
});
