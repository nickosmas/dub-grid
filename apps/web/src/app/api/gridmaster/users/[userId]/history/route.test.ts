import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const loadHistory = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/person-history", () => ({
  loadPersonHistory: (client: unknown, target: unknown) => loadHistory(client, target),
}));

import { GET } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";

function call(id = ID) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/users/${id}/history`), {
    params: Promise.resolve({ userId: id }),
  });
}

describe("GET /api/gridmaster/users/[userId]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm" } });
    loadHistory.mockResolvedValue({ entries: [], truncated: false });
  });

  it("refuses a caller who is not a Gridmaster before reading anything", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await call()).status).toBe(403);
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    expect((await call("nope")).status).toBe(400);
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no such person", async () => {
    loadHistory.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
  });

  it("returns the history for the user target", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [], truncated: false });
    expect(loadHistory).toHaveBeenCalledWith({ service: true }, { kind: "user", userId: ID });
  });

  it("answers 500 without detail when the read fails", async () => {
    loadHistory.mockRejectedValueOnce(new Error("db down"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});
