import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSeeInternalPeople,
  withoutHiddenRequests,
  withoutHiddenStaffRows,
  fetchHiddenInternalUserIds,
  resetInternalUserIdsMemo,
  withoutHiddenMembers,
  withoutHiddenStaff,
} from "./internal-people";

function profilesClient(ids: string[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: ids.map((id) => ({ id })), error: null }).then(resolve),
  };
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, query };
}

function recordingQuery() {
  const calls: unknown[][] = [];
  const query = {
    or: (...args: unknown[]) => (calls.push(["or", ...args]), query),
    not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
  };
  return { query, calls };
}

describe("canSeeInternalPeople", () => {
  it("is true only for a Gridmaster or an internal account", () => {
    expect(canSeeInternalPeople({ isGridmaster: true, isInternal: false })).toBe(true);
    expect(canSeeInternalPeople({ isGridmaster: false, isInternal: true })).toBe(true);
    expect(canSeeInternalPeople({ isGridmaster: false, isInternal: false })).toBe(false);
  });
});

describe("fetchHiddenInternalUserIds", () => {
  beforeEach(() => resetInternalUserIdsMemo());

  it("reads the list once for the requests that arrive within half a minute", async () => {
    const { client, from } = profilesClient(["qa-1"]);
    const viewer = { userId: "client", isGridmaster: false };

    await Promise.all([
      fetchHiddenInternalUserIds(client, viewer),
      fetchHiddenInternalUserIds(client, viewer),
    ]);
    await fetchHiddenInternalUserIds(client, { userId: "qa-1", isGridmaster: false });

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("hides every internal account from a client", async () => {
    const { client, query } = profilesClient(["qa-1", "qa-2"]);
    await expect(
      fetchHiddenInternalUserIds(client, { userId: "client", isGridmaster: false }),
    ).resolves.toEqual(["qa-1", "qa-2"]);
    expect(query.eq).toHaveBeenCalledWith("is_internal", true);
  });

  it("hides no one from an internal account", async () => {
    const { client } = profilesClient(["qa-1", "qa-2"]);
    await expect(
      fetchHiddenInternalUserIds(client, { userId: "qa-2", isGridmaster: false }),
    ).resolves.toEqual([]);
  });

  it("hides no one from a Gridmaster, without a lookup", async () => {
    const { client, from } = profilesClient(["qa-1"]);
    await expect(
      fetchHiddenInternalUserIds(client, { userId: "gm", isGridmaster: true }),
    ).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("query filters", () => {
  it("keeps staff with no account and drops hidden accounts", () => {
    const { query, calls } = recordingQuery();
    withoutHiddenStaff(query, ["qa-1", "qa-2"]);
    expect(calls).toEqual([["or", "user_id.is.null,user_id.not.in.(qa-1,qa-2)"]]);
  });

  it("drops hidden members", () => {
    const { query, calls } = recordingQuery();
    withoutHiddenMembers(query, ["qa-1"]);
    expect(calls).toEqual([["not", "user_id", "in", "(qa-1)"]]);
  });

  it("leaves the query alone when no one is hidden", () => {
    const { query, calls } = recordingQuery();
    withoutHiddenStaff(query, []);
    withoutHiddenMembers(query, []);
    expect(calls).toEqual([]);
  });
});

describe("row filters", () => {
  const hidden = new Set(["emp-qa"]);

  it("drops a hidden staff member's rows", () => {
    const rows = [{ emp_id: "emp-1" }, { emp_id: "emp-qa" }];
    expect(withoutHiddenStaffRows(rows, hidden)).toEqual([{ emp_id: "emp-1" }]);
    expect(withoutHiddenStaffRows(rows, new Set())).toEqual(rows);
  });

  it("drops requests a hidden staff member made or is the target of", () => {
    const rows = [
      { id: "a", requester_emp_id: "emp-1", target_emp_id: null },
      { id: "b", requester_emp_id: "emp-qa", target_emp_id: null },
      { id: "c", requester_emp_id: "emp-1", target_emp_id: "emp-qa" },
      { id: "d", requester_emp_id: "emp-1", target_emp_id: "emp-2" },
    ];
    expect(withoutHiddenRequests(rows, hidden).map((row) => row.id)).toEqual(["a", "d"]);
  });
});
