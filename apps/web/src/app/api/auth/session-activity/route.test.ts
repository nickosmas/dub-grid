import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const requireAuthenticatedSession = vi.fn();
const validateCsrfOrigin = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: () => ({ rpc }),
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import { POST } from "./route";

function request() {
  return new NextRequest("https://acme.dubgrid.com/api/auth/session-activity", { method: "POST" });
}

describe("POST /api/auth/session-activity", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ error: null });
    requireAuthenticatedSession.mockReset().mockResolvedValue({ user: { id: "user-1" } });
    validateCsrfOrigin.mockReset().mockReturnValue(null);
  });

  it("records activity on the caller's own session", async () => {
    const res = await POST(request());
    expect(res.status).toBe(204);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("touch_web_session");
  });

  it("refuses a cross-site request before touching anything", async () => {
    validateCsrfOrigin.mockReturnValue(NextResponse.json({}, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a request with no session", async () => {
    requireAuthenticatedSession.mockResolvedValue({
      response: NextResponse.json({}, { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 500 when the database refuses", async () => {
    rpc.mockResolvedValue({ error: { message: "boom" } });
    expect((await POST(request())).status).toBe(500);
  });
});
