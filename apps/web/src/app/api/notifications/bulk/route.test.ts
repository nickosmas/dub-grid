import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedUserWithClaims = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

import { POST } from "./route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/notifications/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface MockBuilder {
  update: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  then: (resolve: (v: { error: null }) => unknown) => unknown;
}

function makeBuilder(): MockBuilder {
  const builder = {} as MockBuilder;
  const passthrough = vi.fn(() => builder);
  builder.update = passthrough;
  builder.in = passthrough;
  builder.eq = passthrough;
  builder.is = passthrough;
  builder.or = passthrough;
  builder.then = (resolve) => resolve({ error: null });
  return builder;
}

describe("POST /api/notifications/bulk org-scoping", () => {
  let builder: MockBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: USER_ID },
      session: { access_token: "test-token" },
      claims: { sub: USER_ID, org_id: ORG_ID },
    });

    builder = makeBuilder();
    getServiceClient.mockReturnValue({
      from: vi.fn(() => builder),
    });
  });

  it("scopes the update to (user_id, org_id OR null) so foreign-org IDs can't be mutated", async () => {
    // Cross-org leak guard: previously the route did `.in("id", ids)` with
    // no user_id or org_id filter — a user in org A who knew an org-B
    // notification's UUID could mark it read. RLS already prevents this,
    // but this is the route-layer defense.
    const response = await POST(makeRequest({ action: "read", ids: [FOREIGN_NOTIFICATION_ID] }));
    expect(response.status).toBe(200);

    expect(builder.in).toHaveBeenCalledWith("id", [FOREIGN_NOTIFICATION_ID]);
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.or).toHaveBeenCalledWith(`org_id.eq.${ORG_ID},org_id.is.null`);
  });

  it("restricts to platform-only when the caller has no current org", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValueOnce({
      user: { id: USER_ID },
      session: { access_token: "test-token" },
      claims: { sub: USER_ID, org_id: null },
    });

    const response = await POST(makeRequest({ action: "archive", ids: [FOREIGN_NOTIFICATION_ID] }));
    expect(response.status).toBe(200);

    expect(builder.is).toHaveBeenCalledWith("org_id", null);
    expect(builder.or).not.toHaveBeenCalledWith(expect.stringContaining("org_id.eq."));
  });
});
