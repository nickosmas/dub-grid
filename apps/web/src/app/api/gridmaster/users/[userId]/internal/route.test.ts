import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const loadPersonTarget = vi.fn();
const writeAudit = vi.fn();
const validateCsrfOrigin = vi.fn();
const profileUpdates: Array<{ values: unknown; id: unknown }> = [];
const serviceClient = {
  from: (table: string) => {
    if (table !== "profiles") throw new Error(`Unexpected table ${table}`);
    return {
      update: (values: unknown) => ({
        eq: async (_column: string, id: unknown) => {
          profileUpdates.push({ values, id });
          return { error: null };
        },
      }),
    };
  },
};

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => validateCsrfOrigin() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => serviceClient }));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLogAfterCommit: (input: unknown) => writeAudit(input),
}));
vi.mock("@/features/gridmaster/server/person-target", () => ({
  loadPersonTarget: (...args: unknown[]) => loadPersonTarget(...args),
}));

import { POST } from "./route";

const USER = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/gridmaster/users/${USER}/internal`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ userId: USER }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  profileUpdates.length = 0;
  validateCsrfOrigin.mockReturnValue(null);
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm", email: "gm@dubgrid.com" } });
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm" }, sessionId: "s" });
  loadPersonTarget.mockResolvedValue({ userId: USER, email: "qa@dubgrid.test" });
  writeAudit.mockResolvedValue(undefined);
});

describe("POST /api/gridmaster/users/[userId]/internal", () => {
  it("marks the account internal and records why", async () => {
    const response = await post({ isInternal: true, reason: "QA account" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, isInternal: true });
    expect(profileUpdates).toEqual([{ values: { is_internal: true }, id: USER }]);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.marked_internal",
        resourceId: USER,
        details: { targetUserId: USER, reason: "QA account" },
      }),
    );
    // A platform record: no organization sees it in its activity feed.
    expect(writeAudit.mock.calls[0]?.[0]).not.toHaveProperty("orgId");
  });

  it("makes the account a client account again", async () => {
    await post({ isInternal: false, reason: "Real staff member" });

    expect(profileUpdates).toEqual([{ values: { is_internal: false }, id: USER }]);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.marked_client" }),
    );
  });

  it("changes nothing on a stale session", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    expect((await post({ isInternal: true, reason: "QA account" })).status).toBe(403);
    expect(profileUpdates).toEqual([]);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("needs a reason and a yes or no", async () => {
    expect((await post({ isInternal: true, reason: "  " })).status).toBe(400);
    expect((await post({ reason: "QA account" })).status).toBe(400);
    expect(profileUpdates).toEqual([]);
  });

  it("refuses anyone who is not a Gridmaster", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await post({ isInternal: true, reason: "QA account" })).status).toBe(403);
    expect(profileUpdates).toEqual([]);
  });

  it("finds no Gridmaster target", async () => {
    loadPersonTarget.mockResolvedValueOnce(null);

    expect((await post({ isInternal: true, reason: "QA account" })).status).toBe(404);
    expect(profileUpdates).toEqual([]);
  });
});
