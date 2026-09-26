import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const buildRecord = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/person-record", () => ({
  buildPersonRecordForUser: (client: unknown, id: string) => buildRecord(client, id),
}));

import { GET } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";

function call(id = ID) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/users/${id}`), {
    params: Promise.resolve({ userId: id }),
  });
}

describe("GET /api/gridmaster/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm" } });
    buildRecord.mockResolvedValue({ account: null, organizations: [] });
  });

  it("refuses a caller who is not a Gridmaster before reading anything", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(buildRecord).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    const response = await call("not-a-uuid");
    expect(response.status).toBe(400);
    expect(buildRecord).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no record to show", async () => {
    buildRecord.mockResolvedValueOnce(null);
    const response = await call();
    expect(response.status).toBe(404);
  });

  it("returns the record", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ person: { account: null, organizations: [] } });
    expect(buildRecord).toHaveBeenCalledWith({ service: true }, ID);
  });

  it("answers 500 without detail when the read fails", async () => {
    buildRecord.mockRejectedValueOnce(new Error("db down"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});
