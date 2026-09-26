import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const endUserSession = vi.fn();
vi.mock("@/lib/auth/revocation", () => ({
  endUserSession: (...args: unknown[]) => endUserSession(...args),
}));

import {
  disablePersonPushDevice,
  endPersonSession,
  forgetPersonDevice,
  revokePersonCalendarFeed,
} from "./person-security";

type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: unknown };

/** A client that records each query's filters and answers with `rows`. */
function fakeClient(rows: Record<string, unknown>[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select: () => builder,
        delete: () => {
          call.op = "delete";
          return builder;
        },
        update: (values: unknown) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push(["eq", column, value]);
          return builder;
        },
        is: (column: string, value: unknown) => {
          call.filters.push(["is", column, value]);
          return builder;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const USER = "user-1";

describe("person security actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ends the session at the provider, then deletes its row", async () => {
    const { client, calls } = fakeClient([{ supabase_session_id: "auth-1" }]);
    expect(await endPersonSession(client, USER, "row-1")).toBe(true);
    expect(endUserSession).toHaveBeenCalledWith(USER, "auth-1");
    expect(calls.map((call) => call.op)).toEqual(["select", "delete"]);
    for (const call of calls) {
      expect(call.filters).toEqual(
        expect.arrayContaining([
          ["eq", "id", "row-1"],
          ["eq", "user_id", USER],
        ]),
      );
    }
  });

  it("does nothing for a session that is not theirs", async () => {
    const { client, calls } = fakeClient([]);
    expect(await endPersonSession(client, USER, "row-1")).toBe(false);
    expect(endUserSession).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("forgets a device, disables a push device and revokes a feed only on their rows", async () => {
    for (const [action, table] of [
      [forgetPersonDevice, "user_known_devices"],
      [disablePersonPushDevice, "mobile_device_tokens"],
      [revokePersonCalendarFeed, "calendar_feed_tokens"],
    ] as const) {
      const { client, calls } = fakeClient([{ id: "row-1" }]);
      expect(await action(client, USER, "row-1")).toBe(true);
      expect(calls[0]).toMatchObject({ table });
      expect(calls[0]!.filters).toEqual(
        expect.arrayContaining([
          ["eq", "id", "row-1"],
          ["eq", "user_id", USER],
        ]),
      );
      const { client: empty } = fakeClient([]);
      expect(await action(empty, USER, "row-1")).toBe(false);
    }
  });
});
