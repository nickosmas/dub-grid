import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  canAssignOrgRole,
  canManageEmployees,
  isActingInSessionOrg,
  isGridmasterActor,
  type ServiceClient,
} from "./shared";

const requireAuthenticatedUserWithClaims = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

type MockRows = {
  membership?: {
    org_role: string | null;
    admin_permissions: Record<string, boolean> | null;
  } | null;
  profile?: { platform_role: string | null } | null;
  organization?: {
    suspended_at: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
    workspace_kind?: string;
  } | null;
  employee?: { status?: string | null; suspended_at?: string | null } | null;
};

function makeServiceClient(rows: MockRows) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data:
            table === "organization_memberships"
              ? (rows.membership ?? null)
              : table === "organizations"
                ? (rows.organization ?? null)
                : table === "employees"
                  ? (rows.employee ?? null)
                  : table === "profiles"
                    ? (rows.profile ?? null)
                    : null,
          error: null,
        }),
        single: async () => ({
          data: table === "profiles" ? (rows.profile ?? null) : null,
          error: null,
        }),
      };
      return query;
    },
  } as any;
}

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";
const req = new NextRequest("https://app.test/api/employees/identity");

function signedInTo(orgId: string | null) {
  requireAuthenticatedUserWithClaims.mockResolvedValue({
    user: { id: ACTOR_ID },
    claims: { org_id: orgId },
  });
}

beforeEach(() => {
  signedInTo(ORG_ID);
});

describe("isActingInSessionOrg (F-194)", () => {
  const client = (employee?: MockRows["employee"], platformRole = "none") =>
    makeServiceClient({ profile: { platform_role: platformRole }, employee });

  it("refuses another organization than the session's", async () => {
    await expect(isActingInSessionOrg(req, client(), ACTOR_ID, OTHER_ORG_ID)).resolves.toBe(false);
  });

  it("allows the session's own organization, and a token naming none", async () => {
    await expect(isActingInSessionOrg(req, client(), ACTOR_ID, ORG_ID)).resolves.toBe(true);
    signedInTo(null);
    await expect(isActingInSessionOrg(req, client(), ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("refuses someone suspended from the organization", async () => {
    const suspended = client({ suspended_at: "2026-11-01T00:00:00.000Z" });
    await expect(isActingInSessionOrg(req, suspended, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("opens a sandbox only through its cookie (F-198)", async () => {
    const sandbox = makeServiceClient({
      profile: { platform_role: "none" },
      organization: {
        suspended_at: null,
        subscription_status: null,
        trial_ends_at: null,
        workspace_kind: "sandbox",
      },
    });

    signedInTo(null);
    await expect(isActingInSessionOrg(req, sandbox, ACTOR_ID, ORG_ID)).resolves.toBe(false);

    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: ACTOR_ID },
      claims: { org_id: ORG_ID, in_sandbox: true },
    });
    await expect(isActingInSessionOrg(req, sandbox, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("refuses a request that isn't the actor's own", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue({
      user: { id: "someone-else" },
      claims: { org_id: ORG_ID },
    });
    await expect(isActingInSessionOrg(req, client(), ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("leaves a Gridmaster free to manage other organizations", async () => {
    await expect(
      isActingInSessionOrg(req, client(null, "gridmaster"), ACTOR_ID, OTHER_ORG_ID),
    ).resolves.toBe(true);
  });
});

describe("canManageEmployees", () => {
  it("allows an inactive admin whose admin_permissions grant canManageEmployees", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows an inactive super_admin", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("refuses a super_admin once a Gridmaster has suspended the organization (F-225)", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: {
        suspended_at: "2026-11-01T00:00:00Z",
        subscription_status: "active",
        trial_ends_at: null,
      },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("lets a super_admin manage staff through a billing lock", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "unpaid", trial_ends_at: null },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows a gridmaster", async () => {
    const serviceClient = makeServiceClient({
      membership: null,
      profile: { platform_role: "gridmaster" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows an active admin with canManageEmployees", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows an active admin with no employees row (unlinked)", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: null,
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("denies a removed or archived membership", async () => {
    const serviceClient = makeServiceClient({
      membership: null,
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("denies an active admin without the granular employee permission", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: false } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("denies a member when the organization is archived or missing", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: null,
      employee: { status: "active" },
    });

    await expect(canManageEmployees(req, serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });
});

describe("isGridmasterActor (F-69)", () => {
  function makeProfileClient(result: {
    data: { platform_role: string | null } | null;
    error: { message: string } | null;
  }) {
    const tables: string[] = [];
    const client = {
      from(table: string) {
        tables.push(table);
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => result,
        };
        return query;
      },
    } as unknown as ServiceClient;
    return { client, tables };
  }

  it("throws on a read error instead of reporting a non-Gridmaster", async () => {
    const { client, tables } = makeProfileClient({ data: null, error: { message: "boom" } });

    await expect(isGridmasterActor(client, ACTOR_ID)).rejects.toMatchObject({ message: "boom" });
    expect(tables).toEqual(["profiles"]);
  });

  it("is true only for the gridmaster platform role", async () => {
    await expect(
      isGridmasterActor(
        makeProfileClient({ data: { platform_role: "gridmaster" }, error: null }).client,
        ACTOR_ID,
      ),
    ).resolves.toBe(true);
    await expect(
      isGridmasterActor(
        makeProfileClient({ data: { platform_role: "none" }, error: null }).client,
        ACTOR_ID,
      ),
    ).resolves.toBe(false);
    await expect(
      isGridmasterActor(makeProfileClient({ data: null, error: null }).client, ACTOR_ID),
    ).resolves.toBe(false);
  });
});

describe("canAssignOrgRole (F-238)", () => {
  const admin = makeServiceClient({
    membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
    profile: { platform_role: null },
  });

  it("lets an Admin who manages staff invite Users only", async () => {
    await expect(canAssignOrgRole(admin, "actor-1", "org-1", "user")).resolves.toBe(true);
    await expect(canAssignOrgRole(admin, "actor-1", "org-1", "admin")).resolves.toBe(false);
    await expect(canAssignOrgRole(admin, "actor-1", "org-1", "super_admin")).resolves.toBe(false);
  });

  it("lets a Super Admin or Gridmaster give every tier", async () => {
    const superAdmin = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: null },
    });
    const gridmaster = makeServiceClient({
      membership: null,
      profile: { platform_role: "gridmaster" },
    });
    for (const client of [superAdmin, gridmaster]) {
      for (const role of ["user", "admin", "super_admin"]) {
        await expect(canAssignOrgRole(client, "actor-1", "org-1", role)).resolves.toBe(true);
      }
    }
  });
});
