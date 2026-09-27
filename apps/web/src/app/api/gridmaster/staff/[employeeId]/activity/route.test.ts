import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const loadSchedule = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/person-activity", () => ({
  loadPersonSchedule: (client: unknown, id: string) => loadSchedule(client, id),
}));

import { GET } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";

function call(id = ID) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/staff/${id}/activity`), {
    params: Promise.resolve({ employeeId: id }),
  });
}

describe("GET /api/gridmaster/staff/[employeeId]/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm" } });
    loadSchedule.mockResolvedValue({ shifts: [] });
  });

  it("refuses a caller who is not a Gridmaster before reading anything", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await call()).status).toBe(403);
    expect(loadSchedule).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    expect((await call("nope")).status).toBe(400);
    expect(loadSchedule).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown staff record", async () => {
    loadSchedule.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
  });

  it("returns the schedule read with the service client", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schedule: { shifts: [] } });
    expect(loadSchedule).toHaveBeenCalledWith({ service: true }, ID);
  });

  it("answers 500 without detail when the read fails", async () => {
    loadSchedule.mockRejectedValueOnce(new Error("db down"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});
