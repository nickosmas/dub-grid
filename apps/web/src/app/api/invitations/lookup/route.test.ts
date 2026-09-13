import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

import { GET } from "./route";

// Chainable query: select → eq → gt → is → is → maybeSingle (terminal).
function makeQuery() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    gt: () => q,
    is: () => q,
    maybeSingle: () => maybeSingle(),
  };
  return q;
}

function request(token = "22222222-2222-2222-2222-222222222222") {
  return new NextRequest(`http://localhost/api/invitations/lookup?token=${token}`);
}

describe("GET /api/invitations/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceFrom.mockImplementation(() => makeQuery());
  });

  it("returns org metadata for a live invitation", async () => {
    maybeSingle.mockResolvedValue({
      data: { organizations: { name: "Acme", slug: "acme" } },
      error: null,
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ orgName: "Acme", orgSlug: "acme" });
  });

  it("returns 404 for an expired / accepted / revoked / unknown token (no org leak)", async () => {
    // The query's expiry/status filters mean no row comes back for a dead token.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(request("33333333-3333-3333-3333-333333333333"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.orgName).toBeUndefined();
    expect(body.orgSlug).toBeUndefined();
  });

  it("normalizes a missing token to the dead-invitation contract", async () => {
    const res = await GET(new NextRequest("http://localhost/api/invitations/lookup"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "INVITATION_INVALID" });
  });
});
