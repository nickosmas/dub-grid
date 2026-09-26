import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const searchUnlinkedStaff = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/staff-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gridmaster/server/staff-search")>()),
  searchUnlinkedStaff: (...args: unknown[]) => searchUnlinkedStaff(...args),
}));

import { GET } from "./route";

function search(q: string) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/staff?q=${encodeURIComponent(q)}`));
}

describe("GET /api/gridmaster/staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
