import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const validateCsrfOrigin = vi.fn();
const requestRpc = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: requestRpc,
    from: (table: string) => (table === "audit_log" ? { insert: auditInsert } : {}),
  }),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const gridmaster = { user: { id: "gridmaster-user", email: "gm@example.com" } };

async function call() {
  return POST(
    new NextRequest(`http://localhost/api/gridmaster/users/${USER_ID}/reinstate`, {
      method: "POST",
    }),
    { params: Promise.resolve({ userId: USER_ID }) },
  );
}

describe("POST /api/gridmaster/users/[userId]/reinstate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue(gridmaster);
    requireSensitiveActionAuth.mockResolvedValue({
      ...gridmaster,
      claims: { platform_role: "gridmaster" },
    });
    requestRpc.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    auditInsert.mockResolvedValue({ error: null });
  });

  it("reinstates through the RPC and audits it", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(requestRpc).toHaveBeenCalledWith("reinstate_user_account", {
      p_actor_id: "gridmaster-user",
      p_target_user_id: USER_ID,
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.reinstated", resource_id: USER_ID }),
    );
  });

  it("requires fresh sensitive-action assurance", async () => {
    requireSensitiveActionAuth.mockResolvedValue({
      response: NextResponse.json({ error: "step up" }, { status: 403 }),
    });

    const response = await call();

    expect(response.status).toBe(403);
    expect(requestRpc).not.toHaveBeenCalled();
  });

  it("answers 400 when the account is not terminated", async () => {
    requestRpc.mockResolvedValue({
      data: null,
      error: { message: "This account is not terminated" },
    });

    const response = await call();

    expect(response.status).toBe(400);
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
