import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const searchUnlinkedStaff = vi.fn();
const validateCsrfOrigin = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/staff-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gridmaster/server/staff-search")>()),
  searchUnlinkedStaff: (...args: unknown[]) => searchUnlinkedStaff(...args),
}));

import { POST } from "./route";

function search(q: unknown) {
  return POST(
    new NextRequest("http://localhost/api/gridmaster/staff", {
      method: "POST",
      body: JSON.stringify({ q }),
    }),
  );
}

describe("POST /api/gridmaster/staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm" } });
    searchUnlinkedStaff.mockResolvedValue([]);
  });

  it("refuses a caller who is not a Gridmaster", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await search("grace")).status).toBe(403);
    expect(searchUnlinkedStaff).not.toHaveBeenCalled();
  });

  it("needs two characters", async () => {
    expect((await search(" g ")).status).toBe(400);
    expect((await search("%,")).status).toBe(400);
    expect(searchUnlinkedStaff).not.toHaveBeenCalled();
  });

  it("returns the matches for the cleaned terms", async () => {
    searchUnlinkedStaff.mockResolvedValueOnce([{ employeeId: "e-1" }]);
    const response = await search("Grace Hop(per)");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ staff: [{ employeeId: "e-1" }] });
    expect(searchUnlinkedStaff).toHaveBeenCalledWith({ service: true }, ["Grace", "Hopper"]);
  });

  it("refuses a cross-origin request before anything else", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Invalid origin" }, { status: 403 }),
    );
    expect((await search("grace")).status).toBe(403);
    expect(requireGridmasterSession).not.toHaveBeenCalled();
    expect(searchUnlinkedStaff).not.toHaveBeenCalled();
  });

  it("refuses a query that is not text", async () => {
    expect((await search(42)).status).toBe(400);
    expect(searchUnlinkedStaff).not.toHaveBeenCalled();
  });
});
