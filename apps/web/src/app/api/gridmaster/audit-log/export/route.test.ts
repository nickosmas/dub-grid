import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const validateCsrfOrigin = vi.fn();
const serviceFrom = vi.fn();
const auditSelect = vi.fn();
const auditOrder = vi.fn();
const auditLimit = vi.fn();
const auditInsert = vi.fn();
const fetchFilteredAuditRows = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: serviceFrom,
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/audit/server-query", () => ({
  fetchFilteredAuditRows: (...args: unknown[]) => fetchFilteredAuditRows(...args),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/audit-log/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/gridmaster/audit-log/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    fetchFilteredAuditRows.mockResolvedValue([
      {
        id: 1,
        org_id: null,
        actor_id: "gridmaster-user",
        actor_email: "gm@example.com",
        action: "user.force_logout",
        resource_type: "user",
        resource_id: "11111111-1111-4111-8111-111111111111",
        details: { targetUserId: "11111111-1111-4111-8111-111111111111" },
        created_at: "2026-05-02T00:00:00.000Z",
      },
    ]);
    auditOrder.mockReturnValue({ limit: auditLimit });
    auditSelect.mockReturnValue({ order: auditOrder });
    auditInsert.mockResolvedValue({ error: null });
    serviceFrom.mockImplementation((table: string) => {
      if (table === "audit_log") {
        return { select: auditSelect, insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects CSRF failures before auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
  });

  it("exports filtered high-risk audit rows and records audit.exported", async () => {
    const response = await POST(makeRequest({ highRiskOnly: true, limit: 1000 }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rowCount).toBe(1);
    expect(body.entries[0].action).toBe("user.force_logout");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.exported",
        resource_type: "audit_log",
        actor_id: "gridmaster-user",
        details: expect.objectContaining({
          initiated_by: "gridmaster",
          rowCount: 1,
        }),
      }),
    );
    expect(fetchFilteredAuditRows).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ highRiskOnly: true, limit: 1000 }),
    );
  });
});
