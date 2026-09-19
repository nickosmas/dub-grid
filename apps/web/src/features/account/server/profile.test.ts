// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const from = vi.fn();
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from }) }));

import { fetchSelfWorkProfileSnapshot } from "./profile";

function tableBuilder(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return builder;
}

describe("fetchSelfWorkProfileSnapshot", () => {
  it("answers a non-member with an empty work snapshot instead of throwing", async () => {
    // A gridmaster viewing an organization through role-scoped impersonation
    // holds no membership there; /api/account/self used to turn that into 500.
    const tables: Record<string, ReturnType<typeof tableBuilder>> = {
      profiles: tableBuilder({
        data: { first_name: "QA", last_name: "Gridmaster", mfa_enabled: false, terms_version: 1 },
        error: null,
      }),
      organization_memberships: tableBuilder({ data: null, error: null }),
    };
    from.mockImplementation((table: string) => {
      const builder = tables[table];
      if (!builder) throw new Error(`unexpected query on ${table}`);
      return builder;
    });

    await expect(fetchSelfWorkProfileSnapshot("user-1", "org-1")).resolves.toEqual({
      profile: { first_name: "QA", last_name: "Gridmaster", mfa_enabled: false },
      isOrgMember: false,
      employee: null,
      managementDepartmentIds: [],
      shifts: {},
      recurringShifts: [],
    });
    expect(from).not.toHaveBeenCalledWith("employees");
  });

  it("flags a member with no linked employee as an org member", async () => {
    const tables: Record<string, ReturnType<typeof tableBuilder>> = {
      profiles: tableBuilder({
        data: { first_name: "QA", last_name: "Management", mfa_enabled: false, terms_version: 1 },
        error: null,
      }),
      organization_memberships: tableBuilder({
        data: { user_id: "user-2", department_ids: [7] },
        error: null,
      }),
      employees: tableBuilder({ data: null, error: null }),
    };
    from.mockImplementation((table: string) => {
      const builder = tables[table];
      if (!builder) throw new Error(`unexpected query on ${table}`);
      return builder;
    });

    await expect(fetchSelfWorkProfileSnapshot("user-2", "org-1")).resolves.toMatchObject({
      isOrgMember: true,
      employee: null,
      managementDepartmentIds: [7],
    });
  });
});
