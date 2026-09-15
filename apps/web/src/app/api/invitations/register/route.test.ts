import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const maybeSingle = vi.fn();
const membershipCount = vi.fn();
const serviceFrom = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const findAuthUserByEmail = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUser(...args),
        updateUserById: (...args: unknown[]) => updateUserById(...args),
      },
    },
  }),
}));
vi.mock("@/lib/supabase-admin-users", () => ({
  findAuthUserByEmail: (email: string) => findAuthUserByEmail(email),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: null,
  emailTargetLimiter: null,
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  hashEmail: (email: string) => email,
}));

import { POST } from "./route";

const TOKEN = "22222222-2222-2222-2222-222222222222";
const EMAIL = "invitee@example.com";
const STRONG_PASSWORD = "Str0ngPassw0rd!";

// invitations: select → eq → gt → is → is → maybeSingle
function invitationQuery() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    gt: () => q,
    is: () => q,
    maybeSingle: () => maybeSingle(),
  };
  return q;
}

// organization_memberships: select(head, count) → eq (terminal, thenable)
function membershipQuery() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => membershipCount(),
  };
  return q;
}

function request(body: unknown) {
  return new NextRequest("https://app.test/api/invitations/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { token: TOKEN, email: EMAIL, password: STRONG_PASSWORD, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  serviceFrom.mockImplementation((table: string) =>
    table === "invitations" ? invitationQuery() : membershipQuery(),
  );
  maybeSingle.mockResolvedValue({
    data: { email: EMAIL, first_name: "Ada", last_name: "Lovelace" },
    error: null,
  });
  membershipCount.mockResolvedValue({ count: 0, error: null });
  createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  updateUserById.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  findAuthUserByEmail.mockResolvedValue(null);
});

describe("POST /api/invitations/register", () => {
  it("creates the invitee's account already confirmed, so no confirmation email is sent", async () => {
    const res = await POST(request(validBody()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "created" });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL, password: STRONG_PASSWORD, email_confirm: true }),
    );
  });

  it("seeds the profile name from the invitation", async () => {
    await POST(request(validBody()));

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: { first_name: "Ada", last_name: "Lovelace" },
      }),
    );
  });

  it("returns the generic dead-invitation contract for the wrong email", async () => {
    const res = await POST(request(validBody({ email: "someone.else@example.com" })));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "INVITATION_INVALID" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("matches the invited address case-insensitively", async () => {
    const res = await POST(request(validBody({ email: "Invitee@Example.COM" })));

    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: EMAIL }));
  });

  it("returns 404 for a dead token without creating anything", async () => {
    // The query's expiry/status filters mean no row comes back for a token that
    // is unknown, expired, already accepted or revoked.
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(request(validBody()));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "INVITATION_INVALID" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("enforces the password bar server-side", async () => {
    const res = await POST(request(validBody({ password: "weak" })));

    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("never touches the password of a confirmed account", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } });
    findAuthUserByEmail.mockResolvedValue({ id: "user-9", email: EMAIL, emailConfirmed: true });

    const res = await POST(request(validBody()));

    await expect(res.json()).resolves.toEqual({ status: "existing" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("finishes an abandoned signup: confirms it and sets the chosen password", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } });
    findAuthUserByEmail.mockResolvedValue({ id: "user-9", email: EMAIL, emailConfirmed: false });

    const res = await POST(request(validBody()));

    await expect(res.json()).resolves.toEqual({ status: "created" });
    expect(updateUserById).toHaveBeenCalledWith("user-9", {
      email_confirm: true,
      password: STRONG_PASSWORD,
    });
  });

  it("leaves an unconfirmed account that already belongs to an org alone", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } });
    findAuthUserByEmail.mockResolvedValue({ id: "user-9", email: EMAIL, emailConfirmed: false });
    membershipCount.mockResolvedValue({ count: 1, error: null });

    const res = await POST(request(validBody()));

    await expect(res.json()).resolves.toEqual({ status: "existing" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("treats a failed user lookup as 'an account may exist' rather than repairing blind", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } });
    findAuthUserByEmail.mockResolvedValue(null);

    const res = await POST(request(validBody()));

    await expect(res.json()).resolves.toEqual({ status: "existing" });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
