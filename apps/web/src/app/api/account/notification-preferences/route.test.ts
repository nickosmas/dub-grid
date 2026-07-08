import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const fetchNotificationPreferences = vi.fn();
const saveNotificationPreferences = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  fetchNotificationPreferences: (userId: string) => fetchNotificationPreferences(userId),
  saveNotificationPreferences: (userId: string, prefs: unknown) =>
    saveNotificationPreferences(userId, prefs),
}));

import { GET, PUT } from "./route";

const VALID_PREFS = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
};

function putRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/notification-preferences", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: "user-id" } });
  validateCsrfOrigin.mockReturnValue(null);
  fetchNotificationPreferences.mockResolvedValue(VALID_PREFS);
  saveNotificationPreferences.mockImplementation(async (_uid, prefs) => prefs);
});

describe("GET /api/account/notification-preferences", () => {
  it("returns prefs for the authenticated user", async () => {
    const res = await GET(new NextRequest("http://localhost/api/account/notification-preferences"));
    expect(res.status).toBe(200);
    expect(fetchNotificationPreferences).toHaveBeenCalledWith("user-id");
    await expect(res.json()).resolves.toEqual({ prefs: VALID_PREFS });
  });

  it("rejects unauthenticated requests", async () => {
    requireAuthenticatedUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });
    const res = await GET(new NextRequest("http://localhost/api/account/notification-preferences"));
    expect(res.status).toBe(401);
    expect(fetchNotificationPreferences).not.toHaveBeenCalled();
  });
});

describe("PUT /api/account/notification-preferences", () => {
  it("accepts the canonical three categories", async () => {
    const res = await PUT(putRequest({ prefs: VALID_PREFS }));
    expect(res.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith("user-id", VALID_PREFS);
  });

  it("strips unknown category keys before persisting", async () => {
    const res = await PUT(
      putRequest({
        prefs: {
          ...VALID_PREFS,
          marketing: { in_app: true, email: true },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);
    const persisted = saveNotificationPreferences.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(persisted).toEqual(VALID_PREFS);
    expect(persisted).not.toHaveProperty("marketing");
  });

  it("rejects when a category is missing", async () => {
    const { system: _system, ...incomplete } = VALID_PREFS;
    const res = await PUT(putRequest({ prefs: incomplete }));
    expect(res.status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("rejects when a channel field is missing", async () => {
    const res = await PUT(
      putRequest({
        prefs: {
          schedule: { in_app: true },
          shift_requests: { in_app: true, email: false },
          system: { in_app: true, email: false },
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("returns 400 on unparseable body", async () => {
    const res = await PUT(
      new NextRequest("http://localhost/api/account/notification-preferences", {
        method: "PUT",
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it("blocks when CSRF origin is invalid", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PUT(putRequest({ prefs: VALID_PREFS }));
    expect(res.status).toBe(403);
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });
});
