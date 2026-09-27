import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const loadNotifications = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ service: true }) }));
vi.mock("@/features/gridmaster/server/person-notifications", () => ({
  loadPersonNotifications: (client: unknown, id: string) => loadNotifications(client, id),
}));

import { GET } from "./route";

const ID = "22222222-2222-4222-8222-222222222222";

function call(id = ID) {
  return GET(new NextRequest(`http://localhost/api/gridmaster/users/${id}/notifications`), {
    params: Promise.resolve({ userId: id }),
  });
}

describe("GET /api/gridmaster/users/[userId]/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireGridmasterSession.mockResolvedValue({ user: { id: "gm" } });
    loadNotifications.mockResolvedValue({ preferences: null, notifications: [] });
  });

  it("refuses a caller who is not a Gridmaster before reading anything", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await call()).status).toBe(403);
    expect(loadNotifications).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    expect((await call("nope")).status).toBe(400);
    expect(loadNotifications).not.toHaveBeenCalled();
  });

  it("returns the notifications read with the service client", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: { preferences: null, notifications: [] },
    });
    expect(loadNotifications).toHaveBeenCalledWith({ service: true }, ID);
  });

  it("answers 500 without detail when the read fails", async () => {
    loadNotifications.mockRejectedValueOnce(new Error("db down"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});
