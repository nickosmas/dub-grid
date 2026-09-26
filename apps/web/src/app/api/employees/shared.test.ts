import { describe, expect, it } from "vitest";
import { canManageEmployees, isGridmasterActor, type ServiceClient } from "./shared";

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
  } | null;
  employee?: { status: string | null } | null;
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

describe("canManageEmployees", () => {
  it("denies an inactive admin even though admin_permissions grants canManageEmployees", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("does not deny an inactive super_admin (bypass, matches account/permissions/route.ts)", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("does not deny an inactive gridmaster (bypass, matches account/permissions/route.ts)", async () => {
    const serviceClient = makeServiceClient({
      membership: null,
      profile: { platform_role: "gridmaster" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "inactive" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows an active admin with canManageEmployees", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("allows an active admin with no employees row (unlinked)", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: null,
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(true);
  });

  it("denies a removed or archived membership", async () => {
    const serviceClient = makeServiceClient({
      membership: null,
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("denies an active admin without the granular employee permission", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "admin", admin_permissions: { canManageEmployees: false } },
      profile: { platform_role: "none" },
      organization: { suspended_at: null, subscription_status: "active", trial_ends_at: null },
      employee: { status: "active" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
  });

  it("denies a member when the organization is archived or missing", async () => {
    const serviceClient = makeServiceClient({
      membership: { org_role: "super_admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: null,
      employee: { status: "active" },
    });

    await expect(canManageEmployees(serviceClient, ACTOR_ID, ORG_ID)).resolves.toBe(false);
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
