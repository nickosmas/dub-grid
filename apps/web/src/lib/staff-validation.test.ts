import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateStaffOrgReferences } from "./staff-validation";

function client(requiredCertificationIds: number[]) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(
            resolve({
              data:
                table === "organization_roles"
                  ? [
                      {
                        id: 1,
                        name: "Supervisor",
                        required_certification_ids: requiredCertificationIds,
                      },
                    ]
                  : [{ id: 2, name: "Christian Science Nurse II", abbr: "CSN II" }],
              error: null,
            }),
          );
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("validateStaffOrgReferences", () => {
  it("rejects assigning a role when the employee lacks its required certification", async () => {
    const errors = await validateStaffOrgReferences(client([2]), "org", {
      roleIds: [1],
      certificationId: null,
    });
    expect(errors.roleIds).toBe("Supervisor requires CSN II");
  });

  it("allows a role when the employee holds a selected certification", async () => {
    const errors = await validateStaffOrgReferences(client([2]), "org", {
      roleIds: [1],
      certificationId: 2,
    });
    expect(errors.roleIds).toBeUndefined();
  });
});
