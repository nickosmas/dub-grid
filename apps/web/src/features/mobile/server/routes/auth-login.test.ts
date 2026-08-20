import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const getServiceClient = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  loginLimiter: {},
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const DEFAULT_ORG_ID = "577a93d3-8f6a-4b45-a93d-b9731122ce11";
/** Some other organization this user also belongs to. */
const OTHER_ORG_ID = "6f1d0a52-6a9c-4a3a-9c2f-2f5a1f0b8e44";

/**
 * A structurally real access token carrying an org_id claim.
 *
 * The login flow decides whether a switch is still needed by reading the org
 * out of the token it was just handed, so these fixtures have to be decodable
 * JWTs rather than opaque strings. It used to read `is_active` off
 * get_my_organizations instead — a value derived from the user's GLOBAL profile
 * default, which any of their other devices can move.
 */
function tokenForOrg(orgId: string | null): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode(
      orgId
        ? { sub: "8af6f242-c060-4920-a7db-91b4cb66fd26", org_id: orgId }
        : { sub: "8af6f242-c060-4920-a7db-91b4cb66fd26" },
    ),
    "signature",
  ].join(".");
}

function createServiceClientMock(input?: {
  organization?: {
    id: string;
    name: string;
    slug: string;
    suspended_at?: string | null;
    subscription_status?: string | null;
    trial_ends_at?: string | null;
  } | null;
  profile?: {
    platform_role: string | null;
  } | null;
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue(
            table === "organizations"
              ? {
                  data:
                    input && "organization" in input
                      ? (input.organization ?? null)
                      : {
                          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
                          name: "DubGrid Health",
                          slug: "dubgrid-health",
                          suspended_at: null,
                          subscription_status: "active",
                          trial_ends_at: null,
                        },
                  error: null,
                }
              : {
                  data: input?.profile ?? { platform_role: "none" },
                  error: null,
                },
          ),
        })),
      })),
    })),
  };
}

function createSessionClientMock(input?: {
  memberships?: Array<{
    org_id: string;
    org_name: string;
    org_slug: string | null;
    org_role?: string;
    is_active: boolean;
  }>;
  switchError?: { message: string } | null;
  refreshSession?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  } | null;
  factors?: Array<{
    id: string;
    friendly_name?: string | null;
    factor_type: "totp";
    status: "verified";
    created_at?: string;
    updated_at?: string;
  }>;
  signInError?: { message: string } | null;
  /**
   * The org the freshly signed-in token is pinned to. Defaults to the org being
   * logged into, i.e. nothing to reconcile.
   */
  signedInOrgId?: string | null;
}) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "get_my_organizations") {
      return {
        data: input?.memberships ?? [
          {
            org_id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
            org_name: "DubGrid Health",
            org_slug: "dubgrid-health",
            is_active: true,
          },
        ],
        error: null,
      };
    }

    if (fn === "switch_org") {
      return {
        data: null,
        error: input?.switchError ?? null,
      };
    }

    throw new Error(`Unexpected rpc ${fn}`);
  });

  return {
    rpc,
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: input?.signInError
          ? {
              session: null,
              user: null,
            }
          : {
              session: {
                access_token: tokenForOrg(
                  input?.signedInOrgId === undefined ? DEFAULT_ORG_ID : input.signedInOrgId,
                ),
                refresh_token: "refresh-token",
                expires_in: 3600,
                token_type: "bearer",
              },
              user: {
                id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
                email: "manager@dubgrid.com",
                email_confirmed_at: "2026-04-17T00:00:00.000Z",
                factors: input?.factors ?? [],
                user_metadata: {
                  first_name: "Mina",
                  last_name: "Diaz",
                },
              },
            },
        error: input?.signInError ?? null,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: {
          session: input?.refreshSession ?? {
            access_token: "switched-access-token",
            refresh_token: "switched-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
          },
        },
        error: null,
      }),
    },
  };
}

describe("mobile auth login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });

  it("returns 403 ACCOUNT_DISABLED when the JWT hook refuses a terminated employee", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(createServiceClientMock());
    createClient.mockReturnValue(
      createSessionClientMock({
        signInError: {
          message: "Your account has been disabled. Contact your organization admin.",
        },
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Your account has been disabled. Contact your organization admin.",
      code: "ACCOUNT_DISABLED",
    });
  });

  it("returns 429 when the mobile login rate limit is hit", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      misconfigured: false,
      reset: Date.now() + 10_000,
    });

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "Too many login attempts. Please try again later.",
    });
  });

  it("returns 403 when the signed-in user is not a member of the requested organization", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(createServiceClientMock());
    createClient.mockReturnValue(
      createSessionClientMock({
        memberships: [
          {
            org_id: "11111111-1111-4111-8111-111111111111",
            org_name: "Other Org",
            org_slug: "other-org",
            is_active: true,
          },
        ],
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Your account is not associated with that organization.",
    });
  });

  it("returns a generic unavailable message for regular users when trial grace has ended", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        organization: {
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          name: "DubGrid Health",
          slug: "dubgrid-health",
          suspended_at: null,
          subscription_status: "trialing",
          trial_ends_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    createClient.mockReturnValue(
      createSessionClientMock({
        memberships: [
          {
            org_id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
            org_name: "DubGrid Health",
            org_slug: "dubgrid-health",
            org_role: "user",
            is_active: true,
          },
        ],
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error:
        "Organization unavailable. Your organization will be available once your organization administrator finishes setup.",
    });
  });

  // `is_active: true` here is the whole point: it is the value that used to
  // short-circuit the switch, and it is derived from the user's global profile
  // default, which another device moves whenever it switches orgs. The token
  // this device was just handed still names a different org, so the switch is
  // genuinely needed — skipping it returned a session pinned to OTHER_ORG_ID
  // while the response named DubGrid Health, and every later request resolved
  // the other org's roster and permissions from the claim.
  it("switches org context when the issued token names a different org, whatever is_active says", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(createServiceClientMock());
    const sessionClient = createSessionClientMock({
      signedInOrgId: OTHER_ORG_ID,
      memberships: [
        {
          org_id: DEFAULT_ORG_ID,
          org_name: "DubGrid Health",
          org_slug: "dubgrid-health",
          is_active: true,
        },
      ],
    });
    createClient.mockReturnValue(sessionClient);

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sessionClient.rpc).toHaveBeenCalledWith("switch_org", {
      target_org_id: DEFAULT_ORG_ID,
    });
    expect(payload).toMatchObject({
      session: {
        accessToken: "switched-access-token",
        refreshToken: "switched-refresh-token",
      },
      organization: {
        slug: "dubgrid-health",
      },
      user: {
        email: "manager@dubgrid.com",
      },
    });
  });

  it("returns an MFA-required login payload without rejecting verified TOTP users", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(createServiceClientMock());
    createClient.mockReturnValue(
      createSessionClientMock({
        factors: [
          {
            id: "factor-123",
            friendly_name: "DubGrid Authenticator",
            factor_type: "totp",
            status: "verified",
          },
        ],
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      session: {
        // The original token, untouched: it already names the org being logged
        // into, so there is nothing to reconcile and no refresh to burn.
        accessToken: tokenForOrg(DEFAULT_ORG_ID),
        refreshToken: "refresh-token",
      },
      mfaRequired: true,
      mfa: {
        factorId: "factor-123",
        friendlyName: "DubGrid Authenticator",
      },
      organization: {
        slug: "dubgrid-health",
      },
    });
  });

  it("never invokes auth methods on the shared service client (poisoning regression guard)", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });

    // Trap every access to `auth.*` on the service client. The shared
    // singleton must only see `.from()` reads + `auth.admin.*`; any other
    // auth call would set a session on it and downgrade every subsequent
    // service-role query to that user's RLS scope.
    const serviceAuthAccess = vi.fn();
    const sneakyServiceClient = {
      ...createServiceClientMock(),
      auth: new Proxy({} as Record<string, unknown>, {
        get: (_target, prop) => {
          serviceAuthAccess(prop);
          return undefined;
        },
      }),
    };
    getServiceClient.mockReturnValue(sneakyServiceClient);
    createClient.mockReturnValue(createSessionClientMock());

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(serviceAuthAccess).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested organization slug does not exist", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        organization: null,
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: "missing-org",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "We couldn't find that organization. Check the subdomain and try again.",
    });
  });
});
