import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const serviceRpc = vi.fn();
const serviceFrom = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({
    rpc: requestRpc,
  }),
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: serviceRpc,
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { GET, POST } from "./route";

const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/impersonation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/gridmaster/impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    requestRpc.mockResolvedValue({
      data: [
        {
          session_id: SESSION_ID,
          gridmaster_id: "gridmaster-user",
          gridmaster_email: "gm@example.com",
          target_user_id: TARGET_USER_ID,
          target_email: "user@example.com",
          target_org_id: ORG_ID,
          target_org_name: "Arden Wood",
          justification: "Need support investigation",
          ip_address: null,
          user_agent: "vitest",
          created_at: "2026-05-01T15:00:00.000Z",
          ended_at: null,
          end_reason: null,
          expires_at: "2026-05-01T17:00:00.000Z",
        },
      ],
      error: null,
    });
  });

  it("rejects non-gridmaster sessions before loading history", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/gridmaster/impersonation"));

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("loads history with the authenticated request client", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/gridmaster/impersonation?limit=25"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries: [
        {
          sessionId: SESSION_ID,
          gridmasterId: "gridmaster-user",
          gridmasterEmail: "gm@example.com",
          targetUserId: TARGET_USER_ID,
          targetEmail: "user@example.com",
          targetOrgId: ORG_ID,
          targetOrgName: "Arden Wood",
          justification: "Need support investigation",
          ipAddress: null,
          userAgent: "vitest",
          createdAt: "2026-05-01T15:00:00.000Z",
          endedAt: null,
          endReason: null,
          expiresAt: "2026-05-01T17:00:00.000Z",
        },
      ],
    });
    expect(requestRpc).toHaveBeenCalledWith("get_impersonation_history", {
      p_limit: 25,
      p_offset: 0,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/gridmaster/impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    auditInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before gridmaster auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(
      makePostRequest({
        action: "start",
        targetUserId: TARGET_USER_ID,
        justification: "Need support investigation",
      }),
    );

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("rejects non-gridmaster sessions before validation", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(makePostRequest({ action: "bogus" }));

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("validates start input before mutating", async () => {
    const response = await POST(
      makePostRequest({
        action: "start",
        targetUserId: TARGET_USER_ID,
        justification: "short",
      }),
    );

    expect(response.status).toBe(400);
    expect(requestRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("starts impersonation and writes a platform audit event", async () => {
    requestRpc.mockResolvedValueOnce({
      data: {
        session_id: SESSION_ID,
        expires_at: "2026-05-01T17:00:00.000Z",
      },
      error: null,
    });

    const response = await POST(
      makePostRequest({
        action: "start",
        targetUserId: TARGET_USER_ID,
        targetOrgId: ORG_ID,
        justification: "Need support investigation",
        userAgent: "vitest",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: SESSION_ID,
      expiresAt: "2026-05-01T17:00:00.000Z",
    });
    expect(requestRpc).toHaveBeenCalledWith("start_impersonation", {
      p_target_user_id: TARGET_USER_ID,
      p_justification: "Need support investigation",
      p_ip_address: null,
      p_user_agent: "vitest",
      p_target_org_id: ORG_ID,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: "gridmaster-user",
        actor_email: "gm@example.com",
        action: "impersonation.started",
        resource_type: "impersonation_session",
        resource_id: SESSION_ID,
        details: expect.objectContaining({
          initiated_by: "gridmaster",
          targetUserId: TARGET_USER_ID,
          justification: "Need support investigation",
        }),
      }),
    );
  });

  it("answers an already-active session with 409 and the RPC's own message", async () => {
    const message =
      "Cannot start a new impersonation while another session is active. End the current session first.";
    requestRpc.mockResolvedValue({ data: null, error: { message } });

    const response = await POST(
      makePostRequest({
        action: "start",
        targetUserId: TARGET_USER_ID,
        justification: "Need support investigation",
        targetOrgId: ORG_ID,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: message });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("rejects an end reason outside the constraint before calling the RPC", async () => {
    const response = await POST(
      makePostRequest({ action: "end", sessionId: SESSION_ID, reason: "probe" }),
    );

    expect(response.status).toBe(400);
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("ends a session with a constraint-listed reason", async () => {
    requestRpc.mockResolvedValue({ data: null, error: null });

    const response = await POST(
      makePostRequest({ action: "end", sessionId: SESSION_ID, reason: "navigation" }),
    );

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("end_impersonation", {
      p_session_id: SESSION_ID,
      p_reason: "navigation",
    });
  });
});
