import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireGridmasterSession = vi.fn();
const checkRateLimit = vi.fn();
const serviceFrom = vi.fn();
const invalidatePlatformFlagsCache = vi.fn();
const writeGridmasterAuditLog = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

vi.mock("@/lib/feature-flags", () => ({
  invalidatePlatformFlagsCache: (...args: unknown[]) => invalidatePlatformFlagsCache(...args),
}));

vi.mock("@/app/api/gridmaster/_lib/audit", () => ({
  writeGridmasterAuditLog: (...args: unknown[]) => writeGridmasterAuditLog(...args),
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { GET, POST, PUT } from "./route";

const GRIDMASTER = { id: "gridmaster-user", email: "gm@example.com" };
const FLAG_ROW = {
  key: "stripe",
  enabled: true,
  description: "Stripe billing routes.",
  updated_by: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/platform-flags", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makePutRequest(body: unknown) {
  return new NextRequest("http://localhost/api/gridmaster/platform-flags", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("/api/gridmaster/platform-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireGridmasterSession.mockResolvedValue({ user: GRIDMASTER });
    checkRateLimit.mockResolvedValue({ limited: false });
  });

  describe("GET", () => {
    it("rejects non-gridmasters", async () => {
      requireGridmasterSession.mockResolvedValue({
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const response = await GET(makeRequest());

      expect(response.status).toBe(403);
      expect(serviceFrom).not.toHaveBeenCalled();
    });

    it("returns flags mapped to camelCase", async () => {
      const order = vi.fn().mockResolvedValue({ data: [FLAG_ROW], error: null });
      serviceFrom.mockReturnValue({ select: vi.fn(() => ({ order })) });

      const response = await GET(makeRequest());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        flags: [
          {
            key: "stripe",
            enabled: true,
            description: "Stripe billing routes.",
            updatedBy: null,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    });
  });

  describe("POST", () => {
    it("rejects CSRF failures before gridmaster auth", async () => {
      validateCsrfOrigin.mockReturnValueOnce(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

      const response = await POST(
        makeRequest({ key: "stripe", enabled: false, expectedUpdatedAt: "x" }),
      );

      expect(response.status).toBe(403);
      expect(requireGridmasterSession).not.toHaveBeenCalled();
    });

    it("returns 409 when expectedUpdatedAt is stale", async () => {
      const updateEq2 = vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      }));
      const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
      const currentMaybeSingle = vi.fn().mockResolvedValue({ data: FLAG_ROW, error: null });
      serviceFrom.mockImplementation(() => ({
        update: vi.fn(() => ({ eq: updateEq1 })),
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: currentMaybeSingle })) })),
      }));

      const response = await POST(
        makeRequest({ key: "stripe", enabled: false, expectedUpdatedAt: "stale" }),
      );

      expect(response.status).toBe(409);
      expect(invalidatePlatformFlagsCache).not.toHaveBeenCalled();
      expect(writeGridmasterAuditLog).not.toHaveBeenCalled();
    });

    it("updates the flag, invalidates the cache, and writes an audit log", async () => {
      const updatedRow = { ...FLAG_ROW, enabled: false, updated_by: GRIDMASTER.id };
      const updateMaybeSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const updateEq2 = vi.fn(() => ({
        select: vi.fn(() => ({ maybeSingle: updateMaybeSingle })),
      }));
      const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
      serviceFrom.mockReturnValue({ update: vi.fn(() => ({ eq: updateEq1 })) });
      writeGridmasterAuditLog.mockResolvedValue(undefined);

      const response = await POST(
        makeRequest({
          key: "stripe",
          enabled: false,
          expectedUpdatedAt: FLAG_ROW.updated_at,
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        flag: {
          key: "stripe",
          enabled: false,
          description: "Stripe billing routes.",
          updatedBy: GRIDMASTER.id,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      expect(invalidatePlatformFlagsCache).toHaveBeenCalledTimes(1);
      expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: GRIDMASTER,
          action: "platform_feature_flags.updated",
          resourceType: "platform_feature_flag",
          resourceId: "stripe",
          details: { key: "stripe", enabled: false },
        }),
      );
    });
  });

  describe("PUT", () => {
    it("rejects CSRF failures before gridmaster auth", async () => {
      validateCsrfOrigin.mockReturnValueOnce(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

      const response = await PUT(
        makePutRequest({ key: "reports", description: "The Reports page.", enabled: true }),
      );

      expect(response.status).toBe(403);
      expect(requireGridmasterSession).not.toHaveBeenCalled();
    });

    it("rejects a malformed key before touching the database", async () => {
      const response = await PUT(
        makePutRequest({ key: "Reports", description: "The Reports page.", enabled: true }),
      );

      expect(response.status).toBe(400);
      expect(serviceFrom).not.toHaveBeenCalled();
    });

    it("returns 409 when the key already exists", async () => {
      const insertMaybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
      serviceFrom.mockReturnValue({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: insertMaybeSingle })) })),
      });

      const response = await PUT(
        makePutRequest({ key: "stripe", description: "Already exists.", enabled: true }),
      );

      expect(response.status).toBe(409);
      expect(invalidatePlatformFlagsCache).not.toHaveBeenCalled();
    });

    it("creates the flag, invalidates the cache, and writes an audit log", async () => {
      const createdRow = {
        key: "reports",
        enabled: true,
        description: "The Reports page.",
        updated_by: GRIDMASTER.id,
        updated_at: "2026-01-01T00:00:00.000Z",
      };
      const insertFn = vi.fn();
      const insertMaybeSingle = vi.fn().mockResolvedValue({ data: createdRow, error: null });
      serviceFrom.mockReturnValue({
        insert: (...args: unknown[]) => {
          insertFn(...args);
          return { select: vi.fn(() => ({ maybeSingle: insertMaybeSingle })) };
        },
      });
      writeGridmasterAuditLog.mockResolvedValue(undefined);

      const response = await PUT(
        makePutRequest({ key: "reports", description: "The Reports page.", enabled: true }),
      );

      expect(response.status).toBe(201);
      expect(insertFn).toHaveBeenCalledWith({
        key: "reports",
        description: "The Reports page.",
        enabled: true,
        updated_by: GRIDMASTER.id,
      });
      await expect(response.json()).resolves.toEqual({
        flag: {
          key: "reports",
          enabled: true,
          description: "The Reports page.",
          updatedBy: GRIDMASTER.id,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      expect(invalidatePlatformFlagsCache).toHaveBeenCalledTimes(1);
      expect(writeGridmasterAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: GRIDMASTER,
          action: "platform_feature_flags.created",
          resourceType: "platform_feature_flag",
          resourceId: "reports",
          details: { key: "reports", enabled: true, description: "The Reports page." },
        }),
      );
    });
  });
});
