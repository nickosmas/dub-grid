import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginMobileUser } from "./auth";

const USER_ID = "user-1";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** A structurally real access token carrying the given org_id claim. */
function tokenFor(orgId: string | null): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode(orgId ? { sub: USER_ID, org_id: orgId } : { sub: USER_ID }),
    "signature",
  ].join(".");
}

function buildSession(orgId: string | null) {
  return {
    access_token: tokenFor(orgId),
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
  };
}

function buildServiceClient() {
  return {
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: ORG_B,
                  name: "Beta Clinic",
                  slug: "beta",
                  suspended_at: null,
                  subscription_status: "active",
                  trial_ends_at: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { platform_role: "none" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

/**
 * @param tokenOrgId  the org the freshly minted access token actually carries
 * @param isActive    what get_my_organizations claims about the target org
 */
function buildSessionClient(tokenOrgId: string | null, isActive: boolean) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_my_organizations") {
      return {
        data: [
          {
            org_id: ORG_B,
            org_name: "Beta Clinic",
            org_slug: "beta",
            org_role: "admin",
            is_active: isActive,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });

  const refreshSession = vi.fn(async () => ({
    data: { session: buildSession(ORG_B) },
    error: null,
  }));

  const client = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          session: buildSession(tokenOrgId),
          user: {
            id: USER_ID,
            email: "mina@dubgrid.com",
            email_confirmed_at: "2026-01-01T00:00:00.000Z",
            factors: [],
          },
        },
        error: null,
      }),
      refreshSession,
    },
    rpc,
  } as unknown as SupabaseClient;

  return { client, rpc, refreshSession };
}

const LOGIN_INPUT = {
  email: "mina@dubgrid.com",
  password: "hunter2",
  orgSlug: "beta",
} as Parameters<typeof loginMobileUser>[2];

describe("loginMobileUser org reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The bug this exists for: `is_active` came from get_my_organizations, which
  // resolved it from the user's GLOBAL profile default. Another device
  // switching to org B moved that default, so a login to org B on THIS device
  // was told "already active" while the token it had just been handed still
  // said org A — and the switch was skipped. The login response then reported
  // org B while every later request resolved org A from the claim: B's name and
  // branding over A's roster, schedule and permissions.
  it("switches when the token names a different org, even if is_active says otherwise", async () => {
    const { client, rpc, refreshSession } = buildSessionClient(ORG_A, true);

    const result = await loginMobileUser(buildServiceClient(), client, LOGIN_INPUT);

    expect(rpc).toHaveBeenCalledWith("switch_org", { target_org_id: ORG_B });
    expect(refreshSession).toHaveBeenCalled();
    // The returned session is the refreshed one, so the token now agrees with
    // the organization the response names.
    expect(result.session.accessToken).toBe(tokenFor(ORG_B));
    expect(result.organization.id).toBe(ORG_B);
  });

  it("skips the switch when the token already names the target org", async () => {
    const { client, rpc, refreshSession } = buildSessionClient(ORG_B, false);

    await loginMobileUser(buildServiceClient(), client, LOGIN_INPUT);

    expect(rpc).not.toHaveBeenCalledWith("switch_org", expect.anything());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  // A token whose org claim the access-token hook stripped names no org, so it
  // cannot already be correct: switch, don't assume.
  it("switches when the token carries no org claim at all", async () => {
    const { client, rpc } = buildSessionClient(null, true);

    await loginMobileUser(buildServiceClient(), client, LOGIN_INPUT);

    expect(rpc).toHaveBeenCalledWith("switch_org", { target_org_id: ORG_B });
  });
});

describe("loginMobileUser read order", () => {
  function profileClient(profile: Promise<{ data: unknown; error: unknown }>) {
    const base = buildServiceClient();
    return {
      from: (table: string) =>
        table === "profiles"
          ? { select: () => ({ eq: () => ({ maybeSingle: () => profile }) }) }
          : base.from(table),
    } as unknown as SupabaseClient;
  }

  it("starts the membership read without waiting for the profile check", async () => {
    let answerProfile: (value: { data: unknown; error: unknown }) => void = () => {};
    const profile = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      answerProfile = resolve;
    });
    const { client, rpc } = buildSessionClient(ORG_B, false);

    const pending = loginMobileUser(profileClient(profile), client, LOGIN_INPUT);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith("get_my_organizations"));

    answerProfile({ data: { platform_role: "none" }, error: null });
    await expect(pending).resolves.toMatchObject({ organization: { id: ORG_B } });
  });

  it("starts the billing policy load before signing in", async () => {
    const order: string[] = [];
    const { client } = buildSessionClient(ORG_B, false);
    const signIn = client.auth.signInWithPassword.bind(client.auth);
    client.auth.signInWithPassword = (async (...args: Parameters<typeof signIn>) => {
      order.push("sign-in");
      return signIn(...args);
    }) as typeof client.auth.signInWithPassword;

    await loginMobileUser(buildServiceClient(), client, LOGIN_INPUT, {
      loadPlatformBillingPolicy: async () => {
        order.push("policy");
        return undefined as never;
      },
    });

    expect(order).toEqual(["policy", "sign-in"]);
  });

  it("refuses a Gridmaster first, even when the membership read fails", async () => {
    const { client, rpc } = buildSessionClient(ORG_B, false);
    rpc.mockImplementation((async () => ({ data: null, error: { message: "down" } })) as never);

    await expect(
      loginMobileUser(
        profileClient(Promise.resolve({ data: { platform_role: "gridmaster" }, error: null })),
        client,
        LOGIN_INPUT,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "Gridmaster accounts are not supported in the mobile app.",
    });
  });

  it("refuses a non-member before a failed billing policy load is ever awaited", async () => {
    const { client, rpc } = buildSessionClient(ORG_B, false);
    rpc.mockImplementation((async () => ({
      data: [{ org_id: ORG_A, org_name: "Alpha", org_slug: "alpha", is_active: true }],
      error: null,
    })) as never);

    await expect(
      loginMobileUser(buildServiceClient(), client, LOGIN_INPUT, {
        loadPlatformBillingPolicy: async () => {
          throw new Error("policy read failed");
        },
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Your account is not associated with that organization.",
    });
  });
});
