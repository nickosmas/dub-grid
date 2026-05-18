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

import {
  requireAuthenticatedSession,
  requireAuthenticatedUser,
  requireAuthenticatedUserWithClaims,
  requireGridmasterSession,
} from "./api-auth";

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

  it("rejects deactivated users in requireAuthenticatedSession", async () => {
    queueProfileResults({
      data: { deactivated_at: "2026-05-10T12:00:00.000Z" },
    });

    const result = await requireAuthenticatedSession(makeRequest());

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "Your session expired. Please sign in again.",
      });
    }
  });

  it("rejects deactivated users in requireAuthenticatedUser", async () => {
    queueProfileResults({
      data: { deactivated_at: "2026-05-10T12:00:00.000Z" },
    });

    const result = await requireAuthenticatedUser(makeRequest());

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects deactivated users before returning claims", async () => {
    queueProfileResults({
      data: { deactivated_at: "2026-05-10T12:00:00.000Z" },
    });

    const result = await requireAuthenticatedUserWithClaims(makeRequest());

    expect("response" in result).toBe(true);
    expect(authMocks.getClaims).not.toHaveBeenCalled();
  });

  it("rejects stale gridmaster JWTs when the live profile is no longer gridmaster", async () => {
    authMocks.getClaims.mockResolvedValue({
      data: { claims: { platform_role: "gridmaster" } },
      error: null,
    });
    queueProfileResults(
      { data: { deactivated_at: null } },
      { data: { platform_role: "none", deactivated_at: null } },
    );

    const result = await requireGridmasterSession(makeRequest());

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows gridmaster only when both JWT and live profile agree", async () => {
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
