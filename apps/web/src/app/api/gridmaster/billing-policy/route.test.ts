import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const requireSensitiveActionAuth = vi.fn();
const invalidatePolicy = vi.fn();
const invalidateOrg = vi.fn();
const auditInsert = vi.fn();
const platformSingle = vi.fn();
const platformUpdateResult = vi.fn();
const platformUpdate = vi.fn();
const orgMaybeSingle = vi.fn();
const orgUpdate = vi.fn();
const orgUpdateEq = vi.fn();

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
  requireSensitiveActionAuth: (req: NextRequest) => requireSensitiveActionAuth(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: async () => ({ limited: false }),
}));
vi.mock("@/lib/billing-policy", () => ({
  invalidatePlatformBillingPolicyCache: () => invalidatePolicy(),
}));
vi.mock("@/lib/stripe", () => ({
  invalidateOrganizationBillingCache: (orgId: string) => invalidateOrg(orgId),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "platform_billing_settings") {
        return {
          select: () => ({ eq: () => ({ single: platformSingle }) }),
          update: (values: unknown) => {
            platformUpdate(values);
            return {
              eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: platformUpdateResult }) }) }),
            };
          },
        };
      }
      if (table === "organizations") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: orgMaybeSingle }) }) }),
          update: (values: unknown) => {
            orgUpdate(values);
            return { eq: orgUpdateEq };
          },
        };
      }
      if (table === "audit_log") return { insert: auditInsert };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const platformRow = {
  default_trial_days: 14,
  trial_grace_days: 3,
  trial_reminder_days: 7,
  payment_grace_days: 14,
  updated_at: "2026-10-13T00:00:00.000Z",
};
const values = { trialDays: 21, trialGraceDays: 5, trialReminderDays: 7, paymentGraceDays: 14 };

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/gridmaster/billing-policy", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireGridmasterSession.mockResolvedValue({ user: { id: "gm-1", email: "gm@example.com" } });
  requireSensitiveActionAuth.mockResolvedValue({ user: { id: "gm-1" } });
  platformSingle.mockResolvedValue({ data: platformRow, error: null });
  platformUpdateResult.mockResolvedValue({
    data: { ...platformRow, default_trial_days: 21, trial_grace_days: 5 },
    error: null,
  });
  orgMaybeSingle.mockResolvedValue({
    data: { id: ORG_ID, trial_grace_days_override: 10 },
    error: null,
  });
  orgUpdateEq.mockResolvedValue({ error: null });
  auditInsert.mockResolvedValue({ error: null });
});

describe("GET /api/gridmaster/billing-policy", () => {
  it("returns the platform values to a Gridmaster", async () => {
    const response = await GET(new NextRequest("http://localhost/api/gridmaster/billing-policy"));

    await expect(response.json()).resolves.toEqual({
      platform: {
        trialDays: 14,
        trialGraceDays: 3,
        trialReminderDays: 7,
        paymentGraceDays: 14,
        updatedAt: "2026-10-13T00:00:00.000Z",
      },
    });
  });

  it("stays Gridmaster-only", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/gridmaster/billing-policy"));

    expect(response.status).toBe(403);
    expect(platformSingle).not.toHaveBeenCalled();
  });
});

describe("POST /api/gridmaster/billing-policy", () => {
  it("updates the platform defaults, drops the cache, and audits the change", async () => {
    const response = await post({
      scope: "platform",
      values,
      expectedUpdatedAt: platformRow.updated_at,
    });

    expect(response.status).toBe(200);
    expect(platformUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ default_trial_days: 21, trial_grace_days: 5, updated_by: "gm-1" }),
    );
    expect(invalidatePolicy).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.policy_updated",
        details: expect.objectContaining({
          previous: expect.objectContaining({ trialDays: 14 }),
          next: values,
        }),
      }),
    );
  });

  it("refuses a change made against a stale copy", async () => {
    platformUpdateResult.mockResolvedValueOnce({ data: null, error: null });

    const response = await post({
      scope: "platform",
      values,
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(409);
    expect(invalidatePolicy).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("refuses values outside the allowed ranges", async () => {
    const response = await post({
      scope: "platform",
      values: { ...values, trialGraceDays: 91 },
      expectedUpdatedAt: platformRow.updated_at,
    });

    expect(response.status).toBe(400);
    expect(platformUpdate).not.toHaveBeenCalled();
  });

  it("asks for fresh proof before any change", async () => {
    requireSensitiveActionAuth.mockResolvedValueOnce({
      response: NextResponse.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }),
    });

    const response = await post({
      scope: "organization",
      orgId: ORG_ID,
      overrides: { trialDays: 30 },
    });

    expect(response.status).toBe(403);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("sets and clears an organization's overrides, then audits both", async () => {
    const response = await post({
      scope: "organization",
      orgId: ORG_ID,
      overrides: { trialDays: 30, trialGraceDays: null },
    });

    expect(response.status).toBe(200);
    expect(orgUpdate).toHaveBeenCalledWith({
      trial_length_days_override: 30,
      trial_grace_days_override: null,
    });
    expect(invalidateOrg).toHaveBeenCalledWith(ORG_ID);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.policy_overridden",
        org_id: ORG_ID,
        details: expect.objectContaining({
          changes: {
            trialDays: { from: null, to: 30 },
            trialGraceDays: { from: 10, to: null },
          },
        }),
      }),
    );
  });

  it("reports an unknown or sandbox organization", async () => {
    orgMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await post({
      scope: "organization",
      orgId: ORG_ID,
      overrides: { trialDays: 30 },
    });

    expect(response.status).toBe(404);
  });
});
