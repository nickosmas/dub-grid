import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const loadHistory = vi.fn();
const writeAudit = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/person-history", () => ({
  loadPersonHistory: (client: unknown, target: unknown) => loadHistory(client, target),
}));
vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLog: (input: unknown) => writeAudit(input),
}));

import { POST } from "./route";

const ID = "55555555-5555-4555-8555-555555555555";
const ENTRY = { id: "1", action: "user.mfa_reset" };

function call(id = ID) {
  return POST(
    new NextRequest(`http://localhost/api/gridmaster/staff/${id}/history/export`, {
      method: "POST",
    }),
    { params: Promise.resolve({ employeeId: id }) },
  );
}

describe("POST /api/gridmaster/staff/[employeeId]/history/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm", email: "gm@dubgrid.com" } });
    requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm" } });
    loadHistory.mockResolvedValue({ entries: [ENTRY], truncated: false });
    writeAudit.mockResolvedValue(undefined);
  });

  it("rejects a cross-site request before anything else", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    expect((await call()).status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
  });

  it("exports nothing and records nothing on a stale session", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(loadHistory).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("answers 404 and records nothing for an unknown person", async () => {
    loadHistory.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("returns the history and records one export naming the subject", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ rowCount: 1, truncated: false, entries: [ENTRY] });
    expect(loadHistory).toHaveBeenCalledWith({ service: true }, { kind: "staff", employeeId: ID });
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.exported",
        resourceType: "employee",
        resourceId: ID,
        details: expect.objectContaining({ scope: "person_history", rowCount: 1 }),
      }),
    );
  });
});
