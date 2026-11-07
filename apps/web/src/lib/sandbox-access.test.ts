import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseTestSandbox, findUsableSandbox } from "./sandbox-access";

const USER_ID = "user-1";
const SOURCE_ORG = "source-org";
const SANDBOX_ORG = "sandbox-org";
const LIVE_SOURCE = { archived_at: null, suspended_at: null };

function client(rows: {
  membership?: { org_role: string; admin_permissions?: Record<string, boolean> | null } | null;
  profile?: { platform_role: string | null } | null;
  sandbox?: { id: string; sandbox_source_org_id: string | null } | null;
  source?: { archived_at: string | null; suspended_at: string | null } | null;
  employee?: { suspended_at: string | null } | null;
  employeeError?: { message: string };
}) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => {
          if (table === "employees") {
            return { data: rows.employee ?? null, error: rows.employeeError ?? null };
          }
          if (table === "organizations" && rows.sandbox === undefined) {
            return {
              data: rows.source === undefined ? LIVE_SOURCE : rows.source,
              error: null,
            };
          }
          return {
            data:
              table === "organization_memberships"
                ? (rows.membership ?? null)
                : table === "profiles"
                  ? (rows.profile ?? null)
                  : (rows.sandbox ?? null),
            error: null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("canUseTestSandbox", () => {
  const allowed = (rows: Parameters<typeof client>[0]) =>
    canUseTestSandbox(client(rows), USER_ID, SOURCE_ORG);

  it("allows a Super Admin, a Gridmaster and an Admin who manages staff", async () => {
    await expect(allowed({ membership: { org_role: "super_admin" } })).resolves.toBe(true);
    await expect(allowed({ profile: { platform_role: "gridmaster" } })).resolves.toBe(true);
    await expect(
      allowed({
        membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
      }),
    ).resolves.toBe(true);
  });

  it("refuses an Admin who can only edit shifts, a staff member and a non-member", async () => {
    await expect(
      allowed({ membership: { org_role: "admin", admin_permissions: { canEditShifts: true } } }),
    ).resolves.toBe(false);
    await expect(allowed({ membership: { org_role: "user" } })).resolves.toBe(false);
    await expect(allowed({})).resolves.toBe(false);
  });

  it("refuses someone suspended from the source organization", async () => {
    const owner = { membership: { org_role: "super_admin" } };
    await expect(
      allowed({ ...owner, employee: { suspended_at: "2026-11-01T00:00:00.000Z" } }),
    ).resolves.toBe(false);
    await expect(allowed({ ...owner, employeeError: { message: "read failed" } })).resolves.toBe(
      false,
    );
  });

  it("refuses a source organization that is archived, suspended or gone", async () => {
    const owner = { membership: { org_role: "super_admin" } };
    await expect(
      allowed({ ...owner, source: { ...LIVE_SOURCE, archived_at: "2026-11-01T00:00:00.000Z" } }),
    ).resolves.toBe(false);
    await expect(
      allowed({ ...owner, source: { ...LIVE_SOURCE, suspended_at: "2026-11-01T00:00:00.000Z" } }),
    ).resolves.toBe(false);
    await expect(allowed({ ...owner, source: null })).resolves.toBe(false);
  });
});

describe("findUsableSandbox", () => {
  const input = { sandboxOrgId: SANDBOX_ORG, userId: USER_ID, sessionId: "session-1" };
  const sandbox = { id: SANDBOX_ORG, sandbox_source_org_id: SOURCE_ORG };

  it("finds the sandbox while its owner may still use one", async () => {
    await expect(
      findUsableSandbox(client({ sandbox, membership: { org_role: "super_admin" } }), input),
    ).resolves.toEqual({ id: SANDBOX_ORG });
  });

  it("stops finding it once the owner is demoted", async () => {
    await expect(
      findUsableSandbox(client({ sandbox, membership: { org_role: "user" } }), input),
    ).resolves.toBeNull();
  });

  it("finds nothing for a sandbox this session doesn't own, or one with no source", async () => {
    await expect(
      findUsableSandbox(client({ membership: { org_role: "super_admin" } }), input),
    ).resolves.toBeNull();
    await expect(
      findUsableSandbox(
        client({
          sandbox: { id: SANDBOX_ORG, sandbox_source_org_id: null },
          membership: { org_role: "super_admin" },
        }),
        input,
      ),
    ).resolves.toBeNull();
  });
});
