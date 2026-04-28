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

function createServiceClientMock(input?: {
  workspace?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  profile?: {
    platform_role: string | null;
  } | null;
  signInError?: { message: string } | null;
}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: input?.signInError
          ? {
              session: null,
              user: null,
            }
          : {
              session: {
                access_token: "access-token",
                refresh_token: "refresh-token",
                expires_in: 3600,
                token_type: "bearer",
              },
              user: {
                id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
                email: "manager@dubgrid.com",
                email_confirmed_at: "2026-04-17T00:00:00.000Z",
                factors: [],
                user_metadata: {
                  first_name: "Mina",
                  last_name: "Diaz",
                },
              },
            },
        error: input?.signInError ?? null,
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue(
            table === "organizations"
              ? {
                  data:
                    input && "workspace" in input
                      ? (input.workspace ?? null)
                      : {
                          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
                          name: "DubGrid Health",
                          slug: "dubgrid-health",
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
    is_active: boolean;
  }>;
  switchError?: { message: string } | null;
  refreshSession?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  } | null;
}) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "get_my_organizations") {
      return {
        data:
          input?.memberships ?? [
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
      setSession: vi.fn().mockResolvedValue({
        data: {},
        error: null,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: {
          session:
            input?.refreshSession ?? {
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
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
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
          workspaceSlug: "dubgrid-health",
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

  it("returns 403 when the signed-in user is not a member of the requested workspace", async () => {
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
          workspaceSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Your account is not associated with that workspace.",
    });
  });

  it("switches org context before returning the mobile session when the target workspace is inactive", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(createServiceClientMock());
    const sessionClient = createSessionClientMock({
      memberships: [
        {
          org_id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          org_name: "DubGrid Health",
          org_slug: "dubgrid-health",
          is_active: false,
        },
      ],
    });
    createClient.mockReturnValue(sessionClient);

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          workspaceSlug: "dubgrid-health",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sessionClient.rpc).toHaveBeenCalledWith("switch_org", {
      target_org_id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    });
    expect(payload).toMatchObject({
      session: {
        accessToken: "switched-access-token",
        refreshToken: "switched-refresh-token",
      },
      workspace: {
        slug: "dubgrid-health",
      },
      user: {
        email: "manager@dubgrid.com",
      },
    });
  });

  it("returns 404 when the requested workspace slug does not exist", async () => {
    checkRateLimit.mockResolvedValue({ limited: false, misconfigured: false });
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        workspace: null,
      }),
    );

    const { POST } = await import("./auth-login");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          workspaceSlug: "missing-org",
          email: "manager@dubgrid.com",
          password: "super-secret",
        }),
      }) as never,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No workspace matched that slug.",
    });
  });
});
