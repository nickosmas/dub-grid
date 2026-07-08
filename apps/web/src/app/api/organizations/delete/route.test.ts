import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const validateCsrfOrigin = vi.fn();
const forbidIfSandboxCookie = vi.fn();
const checkRateLimit = vi.fn();
const cancelSubscription = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();
const captureException = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  forbidIfSandboxCookie: (req: NextRequest) => forbidIfSandboxCookie(req),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/stripe", () => ({
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
const cacheDel = vi.fn();
vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: { orgBySlug: (slug: string) => `dg:org:slug:${slug}` },
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

/** Builds a chainable service-client stub backed by controllable handlers. */
function buildServiceClient(opts: {
  org: { id: string; name: string; slug?: string; archived_at: string | null } | null;
  orgUpdateError?: unknown;
  subscription?: { stripe_subscription_id: string | null } | null;
}) {
  const orgUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: opts.orgUpdateError ?? null })),
  }));
  const subUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const auditInsert = vi.fn(async () => ({ error: null }));

  const client = {
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: opts.org, error: null })),
            })),
          })),
          update: orgUpdate,
        };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: opts.subscription ?? null, error: null })),
            })),
          })),
          update: subUpdate,
        };
      }
      if (table === "audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { client, orgUpdate, subUpdate, auditInsert };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/organizations/delete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
  forbidIfSandboxCookie.mockReturnValue(null);
  checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: false });
  cancelSubscription.mockResolvedValue({});
});

function authorize(serviceClient: unknown) {
  requireOrgPermissions.mockResolvedValue({
    actor: { id: "actor-1", email: "admin@test.com" },
    serviceClient,
    orgId: ORG_ID,
  });
}

describe("POST /api/organizations/delete", () => {
  it("rejects when the caller is not a super admin", async () => {
    const forbidden = { response: new Response("forbidden", { status: 403 }) };
    requireOrgPermissions.mockResolvedValue(forbidden);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, confirmation: "DELETE Acme" }));
    expect(res.status).toBe(403);
  });

  it("rejects a confirmation that does not match the org name", async () => {
    const { client } = buildServiceClient({ org: { id: ORG_ID, name: "Acme", archived_at: null } });
    authorize(client);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, confirmation: "DELETE Wrong" }));
    expect(res.status).toBe(400);
  });

  it("rejects an org that is already deleted", async () => {
    const { client } = buildServiceClient({
      org: { id: ORG_ID, name: "Acme", archived_at: "2026-01-01T00:00:00Z" },
    });
    authorize(client);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, confirmation: "DELETE Acme" }));
    expect(res.status).toBe(409);
  });

  it("archives the org, cancels Stripe, invalidates the subdomain cache, and audits on success", async () => {
    const { client, orgUpdate, subUpdate, auditInsert } = buildServiceClient({
      org: { id: ORG_ID, name: "Acme", slug: "acme", archived_at: null },
      subscription: { stripe_subscription_id: "sub_123" },
    });
    authorize(client);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, confirmation: "DELETE Acme" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    const updatePayload = (orgUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(updatePayload.archived_at).toEqual(expect.any(String));
    expect(updatePayload.subscription_status).toBe("canceled");
    expect(cancelSubscription).toHaveBeenCalledWith("sub_123");
    expect(subUpdate).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization.deleted", org_id: ORG_ID }),
    );
    // The subdomain-lookup cache must be invalidated so the archived org's
    // subdomain stops resolving immediately instead of waiting out the TTL.
    expect(cacheDel).toHaveBeenCalledWith("dg:org:slug:acme");
  });

  it("still archives the org when there is no Stripe subscription", async () => {
    const { client, orgUpdate, auditInsert } = buildServiceClient({
      org: { id: ORG_ID, name: "Acme", archived_at: null },
      subscription: { stripe_subscription_id: null },
    });
    authorize(client);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ orgId: ORG_ID, confirmation: "DELETE Acme" }));

    expect(res.status).toBe(200);
    expect(orgUpdate).toHaveBeenCalled();
    expect(cancelSubscription).not.toHaveBeenCalled();
    const auditPayload = (auditInsert.mock.calls[0] as unknown[])[0] as {
      details: { stripeCanceled: boolean };
    };
    expect(auditPayload.details.stripeCanceled).toBe(false);
  });
});
