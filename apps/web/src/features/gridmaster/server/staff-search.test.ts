import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { searchUnlinkedStaff, toSearchTerms } from "./staff-search";

function fakeClient(rows: Record<string, unknown>[]) {
  const calls = { is: [] as unknown[][], eq: [] as unknown[][], or: [] as string[], limit: 0 };
  const builder = {
    select: () => builder,
    is: (...args: unknown[]) => {
      calls.is.push(args);
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.eq.push(args);
      return builder;
    },
    or: (filter: string) => {
      calls.or.push(filter);
      return builder;
    },
    order: () => builder,
    limit: async (count: number) => {
      calls.limit = count;
      return { data: rows, error: null };
    },
  };
  return { client: { from: vi.fn(() => builder) } as unknown as SupabaseClient, calls };
}

describe("toSearchTerms", () => {
  it("keeps name, email and phone characters and drops filter syntax", () => {
    expect(toSearchTerms("  O'Neil  ada.l+x@example.com (555)-0100 ")).toEqual([
      "O'Neil",
      "ada.l+x@example.com",
      "555-0100",
    ]);
    expect(toSearchTerms("a,b%c_d*")).toEqual(["abcd"]);
    expect(toSearchTerms("one two three four")).toHaveLength(3);
  });
});

describe("searchUnlinkedStaff", () => {
  it("searches only unlinked staff, every term against each field", async () => {
    const { client, calls } = fakeClient([
      {
        id: "e-1",
        org_id: "o-1",
        first_name: "Grace",
        last_name: "Hopper",
        email: "grace@example.com",
        phone: "",
        status: "active",
        archived_at: null,
        organizations: { name: "Calm Haven" },
      },
    ]);

    const results = await searchUnlinkedStaff(client, ["gra", "hop"]);

    expect(calls.is).toEqual([["user_id", null]]);
    expect(calls.eq).toEqual([["organizations.workspace_kind", "real"]]);
    expect(calls.or).toEqual([
      "first_name.ilike.%gra%,last_name.ilike.%gra%,email.ilike.%gra%,phone.ilike.%gra%",
      "first_name.ilike.%hop%,last_name.ilike.%hop%,email.ilike.%hop%,phone.ilike.%hop%",
    ]);
    expect(calls.limit).toBe(25);
    expect(results).toEqual([
      {
        employeeId: "e-1",
        orgId: "o-1",
        orgName: "Calm Haven",
        name: "Grace Hopper",
        email: "grace@example.com",
        phone: "",
        status: "active",
        archivedAt: null,
      },
    ]);
  });
});
