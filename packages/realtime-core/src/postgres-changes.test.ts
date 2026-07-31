import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeToPostgresChanges } from "./postgres-changes";

function createMockChannel() {
  let subscribeCallback: ((status: string, err?: Error) => void) | undefined;
  const onCalls: Array<{ type: string; filter: Record<string, unknown> }> = [];

  const channel = {
    on: vi.fn((type: string, filter: Record<string, unknown>, _cb: () => void) => {
      onCalls.push({ type, filter });
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string, err?: Error) => void) => {
      subscribeCallback = cb;
      return channel;
    }),
  };

  return {
    channel,
    onCalls,
    emitStatus: (status: string, err?: Error) => subscribeCallback?.(status, err),
  };
}

function createMockClient(mockChannel: ReturnType<typeof createMockChannel>["channel"]) {
  return {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient;
}

describe("subscribeToPostgresChanges", () => {
  it("registers one postgres_changes listener per table with the given filter", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);

    subscribeToPostgresChanges(client, "org-freshness:org-1", [
      { table: "employees", filter: "org_id=eq.org-1", onEvent: vi.fn() },
      { table: "jobs", filter: "org_id=eq.org-1", onEvent: vi.fn() },
    ]);

    expect(client.channel).toHaveBeenCalledWith("org-freshness:org-1");
    expect(mock.onCalls).toEqual([
      {
        type: "postgres_changes",
        filter: { event: "*", schema: "public", table: "employees", filter: "org_id=eq.org-1" },
      },
      {
        type: "postgres_changes",
        filter: { event: "*", schema: "public", table: "jobs", filter: "org_id=eq.org-1" },
      },
    ]);
  });

  it("defaults event to '*' and schema to 'public', but honors explicit overrides", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);

    subscribeToPostgresChanges(client, "perms:m", [
      {
        table: "organization_memberships",
        event: "UPDATE",
        filter: "user_id=eq.user-1",
        onEvent: vi.fn(),
      },
    ]);

    expect(mock.onCalls[0]?.filter).toEqual({
      event: "UPDATE",
      schema: "public",
      table: "organization_memberships",
      filter: "user_id=eq.user-1",
    });
  });

  it("invokes onEvent with the table name and payload when the listener fires", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onEvent = vi.fn();

    subscribeToPostgresChanges(client, "ch", [
      { table: "employees", filter: "org_id=eq.org-1", onEvent },
    ]);

    const handler = mock.channel.on.mock.calls[0]?.[2] as (payload: unknown) => void;
    const payload = { new: { id: "1", org_id: "org-1" } };
    handler(payload);

    expect(onEvent).toHaveBeenCalledWith("employees", payload);
  });

  it("omits the filter key entirely for an unfiltered (platform-wide) listener", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);

    subscribeToPostgresChanges(client, "ch", [{ table: "organizations", onEvent: vi.fn() }]);

    expect(mock.onCalls[0]?.filter).toEqual({
      event: "*",
      schema: "public",
      table: "organizations",
    });
    expect(mock.onCalls[0]?.filter).not.toHaveProperty("filter");
  });

  it("calls onError with a 1-based error count on CHANNEL_ERROR and onReconnectAfterError on the next SUBSCRIBED", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onError = vi.fn();
    const onReconnectAfterError = vi.fn();

    subscribeToPostgresChanges(client, "ch", [], { onError, onReconnectAfterError });

    const error = new Error("boom");
    mock.emitStatus("CHANNEL_ERROR", error);
    expect(onError).toHaveBeenCalledWith(error, 1);
    expect(onReconnectAfterError).not.toHaveBeenCalled();

    mock.emitStatus("SUBSCRIBED");
    expect(onReconnectAfterError).toHaveBeenCalledTimes(1);

    // A later SUBSCRIBED with no intervening error shouldn't fire again.
    mock.emitStatus("SUBSCRIBED");
    expect(onReconnectAfterError).toHaveBeenCalledTimes(1);
  });

  it("increments consecutiveErrorCount across repeated CHANNEL_ERRORs before a reconnect, then resets", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onError = vi.fn();
    const onReconnectAfterError = vi.fn();

    subscribeToPostgresChanges(client, "ch", [], { onError, onReconnectAfterError });

    const error = new Error("boom");
    mock.emitStatus("CHANNEL_ERROR", error);
    mock.emitStatus("CHANNEL_ERROR", error);
    mock.emitStatus("CHANNEL_ERROR", error);
    expect(onError).toHaveBeenNthCalledWith(1, error, 1);
    expect(onError).toHaveBeenNthCalledWith(2, error, 2);
    expect(onError).toHaveBeenNthCalledWith(3, error, 3);

    mock.emitStatus("SUBSCRIBED");
    expect(onReconnectAfterError).toHaveBeenCalledTimes(1);

    mock.emitStatus("CHANNEL_ERROR", error);
    expect(onError).toHaveBeenNthCalledWith(4, error, 1);
  });

  it("does not let a throwing onError hook propagate out of the subscribe callback", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onError = vi.fn(() => {
      throw new Error("consumer bug");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    subscribeToPostgresChanges(client, "ch", [], { onError });

    expect(() => mock.emitStatus("CHANNEL_ERROR", new Error("boom"))).not.toThrow();
    expect(consoleError).toHaveBeenCalled();

    // Bookkeeping still advances normally on the next error despite the prior throw.
    mock.emitStatus("CHANNEL_ERROR", new Error("boom again"));
    expect(onError).toHaveBeenNthCalledWith(2, expect.any(Error), 2);

    consoleError.mockRestore();
  });

  it("does not let a throwing onReconnectAfterError hook propagate out of the subscribe callback", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onReconnectAfterError = vi.fn(() => {
      throw new Error("consumer bug");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    subscribeToPostgresChanges(client, "ch", [], { onReconnectAfterError });

    mock.emitStatus("CHANNEL_ERROR", new Error("boom"));
    expect(() => mock.emitStatus("SUBSCRIBED")).not.toThrow();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("cleanup removes the channel from the client", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);

    const cleanup = subscribeToPostgresChanges(client, "ch", []);
    cleanup();

    expect(client.removeChannel).toHaveBeenCalledWith(mock.channel);
  });
});
