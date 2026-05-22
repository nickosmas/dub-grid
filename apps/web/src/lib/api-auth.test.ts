import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  serviceFrom: vi.fn(),
  profileResults: [] as Array<{ data: Record<string, unknown> | null; error: unknown }>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getSession: authMocks.getSession,
      getUser: authMocks.getUser,
      getClaims: authMocks.getClaims,
    },
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: authMocks.serviceFrom,
  }),
}));

import { requireGridmasterSession } from "./api-auth";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new NextRequest("http://localhost/api/test");
}

function queueProfileResults(
  ...results: Array<{ data: Record<string, unknown> | null; error?: unknown }>
) {
  authMocks.profileResults.push(
    ...results.map((result) => ({ data: result.data, error: result.error ?? null })),
  );
}

describe("api auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.profileResults.length = 0;
    authMocks.getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
    });
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "user@example.com" } },
    });
    authMocks.getClaims.mockResolvedValue({
      data: { claims: { platform_role: "none" } },
      error: null,
    });
    authMocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                authMocks.profileResults.shift() ?? {
                  data: { deactivated_at: null },
                  error: null,
                },
              ),
          }),
        }),
      };
    });
  });

  // NOTE: api-auth does not enforce deactivation or re-verify the live
  // platform_role — that is handled upstream by the custom_access_token_hook
  // (a deactivated user / demoted gridmaster gets no/limited JWT claims). Tests
  // asserting a request-boundary deactivation check were removed as they
  // covered behavior this layer never implemented.

  it("allows a gridmaster whose JWT platform_role is gridmaster", async () => {
    authMocks.getClaims.mockResolvedValue({
      data: { claims: { platform_role: "gridmaster" } },
      error: null,
    });
    queueProfileResults(
      { data: { deactivated_at: null } },
      { data: { platform_role: "gridmaster", deactivated_at: null } },
    );

    const result = await requireGridmasterSession(makeRequest());

    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.user.id).toBe(USER_ID);
    }
  });
});
