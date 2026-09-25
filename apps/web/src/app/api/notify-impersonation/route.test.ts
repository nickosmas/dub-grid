import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

import { POST } from "./route";

function post() {
  return new NextRequest("http://localhost/api/notify-impersonation", {
    method: "POST",
    body: JSON.stringify({ type: "start", sessionId: "33333333-3333-4333-8333-333333333333" }),
  });
}

// The browser used to send these, so a closed tab lost them and a repeated
// call sent them again. The server sends each notice once now (41c3).
describe("POST /api/notify-impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({ user: { id: "gridmaster-user" } });
  });

  it("is retired and sends nothing", async () => {
    const response = await POST(post());

    expect(response.status).toBe(410);
  });

  it("still refuses anyone but a Gridmaster", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await POST(post())).status).toBe(403);
  });

  it("still checks the origin first", async () => {
    validateCsrfOrigin.mockReturnValueOnce(NextResponse.json({}, { status: 403 }));

    expect((await POST(post())).status).toBe(403);
  });
});
