import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const buildRecord = vi.fn();
const writeGridmasterAuditLog = vi.fn();
const checkEmployeeEmailConflict = vi.fn();
const syncLinkedLoginEmail = vi.fn();
const followUpLinkedLoginEmailChange = vi.fn();
const profileUpdate = vi.fn();
const getUserById = vi.fn();

let profileRow: Record<string, unknown> | null;
let staffRows: Record<string, unknown>[];
let membershipRow: Record<string, unknown> | null;

const { LoginEmailConflictError } = vi.hoisted(() => ({
  LoginEmailConflictError: class extends Error {
    readonly conflict = { code: "EMPLOYEE_CONTACT_CONFLICT", error: "taken", field: "email" };
  },
}));

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLog: (input: unknown) => writeGridmasterAuditLog(input),
}));
vi.mock("@/features/gridmaster/server/person-record", () => ({
  buildPersonRecordForUser: (client: unknown, id: string) => buildRecord(client, id),
  throwUnlessNotFound: (error: unknown) => {
    if (error && (error as { status?: number }).status !== 404) throw error;
  },
}));
vi.mock("@/features/employees/server/contact-conflicts", () => ({
  checkEmployeeEmailConflict: (...args: unknown[]) => checkEmployeeEmailConflict(...args),
}));
vi.mock("@/features/employees/server/login-email", () => ({
  LoginEmailConflictError,
  syncLinkedLoginEmail: (...args: unknown[]) => syncLinkedLoginEmail(...args),
}));
vi.mock("@/features/employees/server/login-email-follow-up", () => ({
  followUpLinkedLoginEmailChange: (input: unknown) => followUpLinkedLoginEmailChange(input),
}));

function chain(result: () => { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result();
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}

const serviceClient = {
  from: (table: string) => {
    if (table === "profiles") {
      return {
        ...chain(() => ({ data: profileRow, error: null })),
        update: (values: unknown) => {
          profileUpdate(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    if (table === "employees") return chain(() => ({ data: staffRows, error: null }));
    if (table === "organization_memberships") {
      return chain(() => ({ data: membershipRow, error: null }));
    }
    throw new Error(`Unexpected table ${table}`);
  },
  auth: { admin: { getUserById: (id: string) => getUserById(id) } },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => serviceClient }));

import { GET, PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function get(id = ID) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/users/${id}`), {
    params: Promise.resolve({ userId: id }),
  });
}

function patch(body: unknown, id = ID) {
  return PATCH(
    new NextRequest(`http://localhost/api/gridmaster/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ userId: id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm", email: "gm@dubgrid.com" } });
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm" }, sessionId: "gm-session" });
  buildRecord.mockResolvedValue({ account: null, organizations: [] });
  profileRow = { platform_role: "none", first_name: "Ada", last_name: "Lovelace" };
  staffRows = [{ id: "staff-1", org_id: ORG }];
  membershipRow = { org_id: ORG };
  getUserById.mockResolvedValue({ data: { user: { id: ID, email: "ada@example.com" } } });
  checkEmployeeEmailConflict.mockResolvedValue({ conflict: false, conflictingEmployeeId: null });
  syncLinkedLoginEmail.mockResolvedValue(undefined);
  followUpLinkedLoginEmailChange.mockResolvedValue(undefined);
  writeGridmasterAuditLog.mockResolvedValue(undefined);
});

describe("GET /api/gridmaster/users/[userId]", () => {
  it("refuses a caller who is not a Gridmaster before reading anything", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect(buildRecord).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    expect((await get("not-a-uuid")).status).toBe(400);
    expect(buildRecord).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no record to show", async () => {
    buildRecord.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
  });

  it("returns the record", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ person: { account: null, organizations: [] } });
    expect(buildRecord).toHaveBeenCalledWith(serviceClient, ID);
  });

  it("answers 500 without detail when the read fails", async () => {
    buildRecord.mockRejectedValueOnce(new Error("db down"));
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});

describe("PATCH /api/gridmaster/users/[userId]", () => {
  it("changes nothing on a stale session", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });
    const response = await patch({ action: "editName", firstName: "A", lastName: "B" });
    expect(response.status).toBe(403);
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(writeGridmasterAuditLog).not.toHaveBeenCalled();
  });

  it("refuses a Gridmaster target", async () => {
    profileRow = { platform_role: "gridmaster", first_name: null, last_name: null };
    const response = await patch({ action: "editName", firstName: "A", lastName: "B" });
    expect(response.status).toBe(404);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    expect((await patch({ action: "promote" })).status).toBe(400);
  });

  it("edits the name and records both versions", async () => {
    const response = await patch({ action: "editName", firstName: " Augusta ", lastName: "" });
    expect(response.status).toBe(200);
    expect(profileUpdate).toHaveBeenCalledWith({ first_name: "Augusta", last_name: null });
    expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.name_changed",
        resourceId: ID,
        details: {
          targetUserId: ID,
          previous: { firstName: "Ada", lastName: "Lovelace" },
          next: { firstName: "Augusta", lastName: null },
        },
      }),
    );
  });

  it("refuses an email another person in their organization already uses", async () => {
    checkEmployeeEmailConflict.mockResolvedValueOnce({
      conflict: true,
      conflictingEmployeeId: "staff-2",
      reason: "employee_duplicate",
    });
    const response = await patch({ action: "changeEmail", email: "grace@example.com" });
    expect(response.status).toBe(409);
    expect(checkEmployeeEmailConflict).toHaveBeenCalledWith(serviceClient, {
      orgId: ORG,
      email: "grace@example.com",
      excludeEmployeeId: "staff-1",
      currentUserId: ID,
    });
    expect(syncLinkedLoginEmail).not.toHaveBeenCalled();
  });

  it("refuses an email another account holds", async () => {
    syncLinkedLoginEmail.mockRejectedValueOnce(new LoginEmailConflictError());
    const response = await patch({ action: "changeEmail", email: "grace@example.com" });
    expect(response.status).toBe(409);
    expect(followUpLinkedLoginEmailChange).not.toHaveBeenCalled();
    expect(writeGridmasterAuditLog).not.toHaveBeenCalled();
  });

  it("refuses their current email", async () => {
    const response = await patch({ action: "changeEmail", email: "ADA@example.com" });
    expect(response.status).toBe(400);
    expect(syncLinkedLoginEmail).not.toHaveBeenCalled();
  });

  it("changes the sign-in email, ends sessions and notifies, then records it", async () => {
    const response = await patch({ action: "changeEmail", email: "Augusta@Example.com" });
    expect(response.status).toBe(200);
    expect(syncLinkedLoginEmail).toHaveBeenCalledWith(serviceClient, {
      userId: ID,
      email: "augusta@example.com",
    });
    expect(followUpLinkedLoginEmailChange).toHaveBeenCalledWith({
      serviceClient,
      userId: ID,
      previousEmail: "ada@example.com",
      newEmail: "augusta@example.com",
      orgId: ORG,
      actorId: "gm",
      actorSessionId: "gm-session",
    });
    expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.email_changed",
        details: {
          targetUserId: ID,
          previousEmail: "ada@example.com",
          newEmail: "augusta@example.com",
        },
      }),
    );
  });

  it("keeps a committed change when its audit write fails", async () => {
    writeGridmasterAuditLog.mockRejectedValueOnce(new Error("audit down"));
    const response = await patch({ action: "changeEmail", email: "augusta@example.com" });
    expect(response.status).toBe(200);
    expect(followUpLinkedLoginEmailChange).toHaveBeenCalled();
  });

  it("does not read an Auth outage as a missing account", async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 503 } });
    const response = await patch({ action: "editName", firstName: "A", lastName: "B" });
    expect(response.status).toBe(500);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("names no organization in the notices when they have no membership", async () => {
    membershipRow = null;
    await patch({ action: "changeEmail", email: "augusta@example.com" });
    expect(followUpLinkedLoginEmailChange).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: null }),
    );
  });
});
