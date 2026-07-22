import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeOrgScopedRealtime } from "./org-scoped-subscription";

function createMockChannel() {
  const onCalls: Array<{ filter: Record<string, unknown>; handler: () => void }> = [];
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, unknown>, handler: () => void) => {
      onCalls.push({ filter, handler });
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return { channel, onCalls };
}

function createMockClient(mockChannel: ReturnType<typeof createMockChannel>["channel"]) {
  return {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient;
}

describe("subscribeOrgScopedRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes every table with an org_id filter, plus the row-scoped table with an id filter", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);

    subscribeOrgScopedRealtime({
      client,
      orgId: "org-1",
      tables: ["employees", "jobs"] as const,
      rowScopedTable: "organizations" as const,
      debounceMs: 150,
      onFlush: vi.fn(),
      channelNamePrefix: "org-freshness",
    });

    const filters = mock.onCalls.map((call) => call.filter);
    expect(filters).toEqual([
      expect.objectContaining({ table: "organizations", filter: "id=eq.org-1" }),
      expect.objectContaining({ table: "employees", filter: "org_id=eq.org-1" }),
      expect.objectContaining({ table: "jobs", filter: "org_id=eq.org-1" }),
    ]);
  });

  it("debounces bursts into a single onFlush call with the deduplicated table list", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onFlush = vi.fn();

    subscribeOrgScopedRealtime({
      client,
      orgId: "org-1",
      tables: ["employees", "jobs"] as const,
      debounceMs: 150,
      onFlush,
      channelNamePrefix: "org-freshness",
    });

    mock.onCalls.forEach(({ handler }) => handler());
    mock.onCalls.forEach(({ handler }) => handler());

    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["employees", "jobs"]);
  });

  it("cleanup disposes the debounce timer and removes the channel", () => {
    const mock = createMockChannel();
    const client = createMockClient(mock.channel);
    const onFlush = vi.fn();

    const cleanup = subscribeOrgScopedRealtime({
      client,
      orgId: "org-1",
      tables: ["employees"] as const,
      debounceMs: 150,
      onFlush,
      channelNamePrefix: "org-freshness",
    });

    mock.onCalls[0]?.handler();
    cleanup();
    vi.advanceTimersByTime(150);

    expect(onFlush).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledWith(mock.channel);
  });
});
