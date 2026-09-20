import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { endImpersonationOnEscape, verifyImpersonationSession } from "./impersonation-server";

const IMPERSONATION_ID = "11111111-1111-4111-8111-111111111111";
const GRIDMASTER_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_USER_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_ORG_ID = "55555555-5555-4555-8555-555555555555";

function makeService(overrides: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    impersonation_sessions: {
      target_user_id: TARGET_USER_ID,
      target_org_id: TARGET_ORG_ID,
    },
    profiles: { id: TARGET_USER_ID },
    organization_memberships: { org_role: "admin" },
    organizations: { slug: "calm-haven" },
    ...overrides,
  };
  const queries = new Map<string, { eq: ReturnType<typeof vi.fn> }>();
  const service = {
    from: vi.fn((table: string) => {
      const query = {
        eq: vi.fn(),
        is: vi.fn(),
        gt: vi.fn(),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
      };
      query.eq.mockReturnValue(query);
      query.is.mockReturnValue(query);
      query.gt.mockReturnValue(query);
      queries.set(table, query);
      return { select: vi.fn(() => query) };
    }),
  };
  return { service: service as unknown as SupabaseClient, queries };
}

describe("verifyImpersonationSession", () => {
  it("returns only live server-side target context owned by this auth session", async () => {
    const { service, queries } = makeService();

    await expect(
      verifyImpersonationSession(service, IMPERSONATION_ID, GRIDMASTER_ID, AUTH_SESSION_ID),
    ).resolves.toEqual({
      targetUserId: TARGET_USER_ID,
      targetOrgId: TARGET_ORG_ID,
      targetOrgRole: "admin",
      targetOrgSlug: "calm-haven",
    });
    expect(queries.get("impersonation_sessions")?.eq).toHaveBeenCalledWith(
      "auth_session_id",
      AUTH_SESSION_ID,
    );
  });

  it.each([
    ["stale impersonation", { impersonation_sessions: null }],
    ["removed target", { profiles: null }],
    ["removed membership", { organization_memberships: null }],
    ["unavailable organization", { organizations: null }],
  ])("rejects %s state", async (_label, overrides) => {
    const { service } = makeService(overrides);
    await expect(
      verifyImpersonationSession(service, IMPERSONATION_ID, GRIDMASTER_ID, AUTH_SESSION_ID),
    ).resolves.toBeNull();
  });
});

describe("endImpersonationOnEscape", () => {
  it("ends the row as the gridmaster with the navigation reason", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await expect(
      endImpersonationOnEscape({ rpc } as unknown as SupabaseClient, IMPERSONATION_ID),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("end_impersonation", {
      p_session_id: IMPERSONATION_ID,
      p_reason: "navigation",
    });
  });

  it("reports a failed end without throwing", async () => {
    const rpc = vi.fn(async () => ({ error: { message: "nope" } }));
    await expect(
      endImpersonationOnEscape({ rpc } as unknown as SupabaseClient, IMPERSONATION_ID),
    ).resolves.toBe(false);
  });
});
