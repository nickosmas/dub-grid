import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveMobilePushTokenRows } from "./mobile";

function tokenClient() {
  const filters: Array<[string, string, unknown]> = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push(["eq", column, value]);
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push(["is", column, value]);
      return query;
    }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [{ expo_push_token: "token-a" }], error: null }).then(resolve),
  };
  const client = { from: vi.fn(() => query) } as unknown as SupabaseClient;
  return { client, filters };
}

describe("fetchActiveMobilePushTokenRows", () => {
  it("scopes to the organization when one is given", async () => {
    const { client, filters } = tokenClient();

    await fetchActiveMobilePushTokenRows(client, { userId: "user-1", orgId: "org-1" });

    expect(filters).toContainEqual(["eq", "org_id", "org-1"]);
    expect(filters).toContainEqual(["eq", "user_id", "user-1"]);
    expect(filters).toContainEqual(["is", "disabled_at", null]);
  });

  it("reads every organization's active tokens when none is given", async () => {
    const { client, filters } = tokenClient();

    const rows = await fetchActiveMobilePushTokenRows(client, { userId: "user-1", orgId: null });

    expect(rows).toEqual([{ expo_push_token: "token-a" }]);
    expect(filters.some(([, column]) => column === "org_id")).toBe(false);
    expect(filters).toContainEqual(["eq", "user_id", "user-1"]);
    expect(filters).toContainEqual(["is", "disabled_at", null]);
  });
});
