import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLATFORM_TOPIC,
  orgDraftsTopic,
  orgTopic,
  subscribeToTableChanges,
  toChangePayload,
  userTopic,
} from "./table-changes";

type Message = { payload?: Record<string, unknown> };

function createMockClient() {
  const channels = new Map<
    string,
    {
      options: unknown;
      onMessage?: (message: Message) => void;
      onStatus?: (status: string, error?: Error) => void;
      channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
    }
  >();
  const client = {
    channel: vi.fn((topic: string, options: unknown) => {
      const record = {
        options,
        onMessage: undefined as ((message: Message) => void) | undefined,
        onStatus: undefined as ((status: string, error?: Error) => void) | undefined,
        channel: {
          on: vi.fn((_type: string, _filter: unknown, handler: (message: Message) => void) => {
            record.onMessage = handler;
            return record.channel;
          }),
          subscribe: vi.fn((handler: (status: string, error?: Error) => void) => {
            record.onStatus = handler;
            return record.channel;
          }),
        },
      };
      channels.set(topic, record);
      return record.channel;
    }),
    removeChannel: vi.fn(),
  };
  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    send: (topic: string, payload: Record<string, unknown>) =>
      channels.get(topic)?.onMessage?.({ payload }),
    status: (topic: string, status: string, error?: Error) =>
      channels.get(topic)?.onStatus?.(status, error),
    options: (topic: string) => channels.get(topic)?.options,
  };
}

describe("topics", () => {
  it("names one topic per organization, its drafts, a person and the platform", () => {
    expect(orgTopic("o1")).toBe("org:o1");
    expect(orgDraftsTopic("o1")).toBe("org:o1:drafts");
    expect(userTopic("u1")).toBe("user:u1");
    expect(PLATFORM_TOPIC).toBe("platform");
  });
});

describe("toChangePayload", () => {
  it("reads the operation, scope, view stamps and ids the database sends", () => {
    expect(
      toChangePayload({
        table: "organization_memberships",
        op: "UPDATE",
        scope: "org",
        view_stamps: [{ user_id: "u1", updated_at: "2026-11-13T00:00:00Z" }, { user_id: 4 }],
        org_ids: ["o1", 2],
        user_ids: ["u1"],
      }),
    ).toEqual({
      eventType: "UPDATE",
      scope: "org",
      viewStamps: [{ userId: "u1", updatedAt: "2026-11-13T00:00:00Z" }],
      orgIds: ["o1"],
      userIds: ["u1"],
    });
  });

  it("drops an operation or scope it doesn't know", () => {
    expect(toChangePayload({ op: "TRUNCATE", scope: "everyone" })).toEqual({});
  });
});

describe("subscribeToTableChanges", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("joins each topic once, privately, and hands a change to the listeners for its table", () => {
    const mock = createMockClient();
    const onJobs = vi.fn();
    const onEmployees = vi.fn();

    subscribeToTableChanges(mock.client, [
      { table: "jobs", topic: "org:o1", onEvent: onJobs },
      { table: "employees", topic: "org:o1", onEvent: onEmployees },
    ]);
    mock.send("org:o1", { table: "jobs", op: "UPDATE", scope: "org" });

    expect(mock.raw.channel).toHaveBeenCalledExactlyOnceWith("org:o1", {
      config: { private: true },
    });
    expect(onJobs).toHaveBeenCalledWith("jobs", { eventType: "UPDATE", scope: "org" });
    expect(onEmployees).not.toHaveBeenCalled();
  });

  it("filters by operation when a listener names one", () => {
    const mock = createMockClient();
    const onInsert = vi.fn();
    subscribeToTableChanges(mock.client, [
      { table: "notifications", topic: "user:u1", event: "INSERT", onEvent: onInsert },
    ]);

    mock.send("user:u1", { table: "notifications", op: "UPDATE" });
    mock.send("user:u1", { table: "notifications", op: "INSERT" });

    expect(onInsert).toHaveBeenCalledOnce();
  });

  it("shares one channel between subscriptions and removes it after the last leaves", () => {
    const mock = createMockClient();
    const first = vi.fn();
    const second = vi.fn();
    const leaveFirst = subscribeToTableChanges(mock.client, [
      { table: "jobs", topic: "org:o1", onEvent: first },
    ]);
    const leaveSecond = subscribeToTableChanges(mock.client, [
      { table: "jobs", topic: "org:o1", onEvent: second },
    ]);

    mock.send("org:o1", { table: "jobs", op: "INSERT" });
    expect(mock.raw.channel).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    leaveFirst();
    vi.runAllTimers();
    expect(mock.raw.removeChannel).not.toHaveBeenCalled();
    leaveSecond();
    vi.runAllTimers();
    expect(mock.raw.removeChannel).toHaveBeenCalledOnce();
  });

  it("takes the channel back when a remount rejoins before it is removed", () => {
    const mock = createMockClient();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent: vi.fn() }])();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent: vi.fn() }]);
    vi.runAllTimers();

    expect(mock.raw.channel).toHaveBeenCalledOnce();
    expect(mock.raw.removeChannel).not.toHaveBeenCalled();
  });

  it("opens a new channel when the one it held was closed, as sign-out does", () => {
    const mock = createMockClient();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent: vi.fn() }]);
    const closed = mock.raw.channel.mock.results[0]?.value as { state?: string };
    closed.state = "closed";

    const onEvent = vi.fn();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent }]);
    mock.send("org:o1", { table: "jobs", op: "UPDATE" });

    expect(mock.raw.channel).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("reports errors and a reconnect after one", () => {
    const mock = createMockClient();
    const onError = vi.fn();
    const onReconnectAfterError = vi.fn();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent: vi.fn() }], {
      onError,
      onReconnectAfterError,
    });

    mock.status("org:o1", "SUBSCRIBED");
    expect(onReconnectAfterError).not.toHaveBeenCalled();
    mock.status("org:o1", "CHANNEL_ERROR", new Error("down"));
    mock.status("org:o1", "CHANNEL_ERROR");
    mock.status("org:o1", "SUBSCRIBED");

    expect(onError).toHaveBeenNthCalledWith(1, new Error("down"), 1);
    expect(onError).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
    expect(onReconnectAfterError).toHaveBeenCalledOnce();
  });

  it("treats a timed-out join as a gap to catch up on", () => {
    const mock = createMockClient();
    const onReconnectAfterError = vi.fn();
    subscribeToTableChanges(mock.client, [{ table: "jobs", topic: "org:o1", onEvent: vi.fn() }], {
      onReconnectAfterError,
    });

    mock.status("org:o1", "TIMED_OUT");
    mock.status("org:o1", "SUBSCRIBED");

    expect(onReconnectAfterError).toHaveBeenCalledOnce();
  });
});
