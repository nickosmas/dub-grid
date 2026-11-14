import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeOrgScopedRealtime } from "./org-scoped-subscription";

type Message = { payload?: Record<string, unknown> };

function createMockClient() {
  const handlers = new Map<string, (message: Message) => void>();
  const client = {
    channel: vi.fn((topic: string) => {
      const channel = {
        on: vi.fn((_type: string, _filter: unknown, handler: (message: Message) => void) => {
          handlers.set(topic, handler);
          return channel;
        }),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    send: (topic: string, payload: Record<string, unknown>) => handlers.get(topic)?.({ payload }),
  };
}

describe("subscribeOrgScopedRealtime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("listens on the organization's topic, and its drafts topic only when asked", () => {
    const staff = createMockClient();
    subscribeOrgScopedRealtime({
      client: staff.client,
      orgId: "org-1",
      tables: ["employees"] as const,
      debounceMs: 150,
      onFlush: vi.fn(),
    });
    expect(staff.raw.channel.mock.calls.map(([topic]) => topic)).toEqual(["org:org-1"]);

    const editor = createMockClient();
    subscribeOrgScopedRealtime({
      client: editor.client,
      orgId: "org-1",
      tables: ["schedule_cells"] as const,
      includeDrafts: true,
      debounceMs: 150,
      onFlush: vi.fn(),
    });
    expect(editor.raw.channel.mock.calls.map(([topic]) => topic)).toEqual([
      "org:org-1",
      "org:org-1:drafts",
    ]);
  });

  it("debounces bursts into a single onFlush call with the deduplicated table list", () => {
    const mock = createMockClient();
    const onFlush = vi.fn();
    subscribeOrgScopedRealtime({
      client: mock.client,
      orgId: "org-1",
      tables: ["employees", "jobs"] as const,
      debounceMs: 150,
      onFlush,
    });

    mock.send("org:org-1", { table: "employees", op: "UPDATE" });
    mock.send("org:org-1", { table: "jobs", op: "INSERT" });
    mock.send("org:org-1", { table: "employees", op: "UPDATE" });
    mock.send("org:org-1", { table: "invitations", op: "INSERT" });
    vi.advanceTimersByTime(150);

    expect(onFlush).toHaveBeenCalledExactlyOnceWith(["employees", "jobs"]);
  });

  it("leaves out an event the caller handled", () => {
    const mock = createMockClient();
    const onFlush = vi.fn();
    const skipEvent = vi.fn(
      (_table: string, payload: { viewStamps?: readonly unknown[] }) =>
        payload.viewStamps !== undefined,
    );
    subscribeOrgScopedRealtime({
      client: mock.client,
      orgId: "org-1",
      tables: ["organization_memberships"] as const,
      debounceMs: 150,
      onFlush,
      skipEvent,
    });

    mock.send("org:org-1", {
      table: "organization_memberships",
      op: "UPDATE",
      view_stamps: [{ user_id: "u1", updated_at: "2026-11-13T00:00:00Z" }],
    });
    vi.advanceTimersByTime(150);

    expect(skipEvent).toHaveBeenCalledOnce();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("stops flushing once disposed", () => {
    const mock = createMockClient();
    const onFlush = vi.fn();
    const dispose = subscribeOrgScopedRealtime({
      client: mock.client,
      orgId: "org-1",
      tables: ["employees"] as const,
      debounceMs: 150,
      onFlush,
    });

    mock.send("org:org-1", { table: "employees", op: "UPDATE" });
    dispose();
    vi.advanceTimersByTime(1_000);

    expect(onFlush).not.toHaveBeenCalled();
    expect(mock.raw.removeChannel).toHaveBeenCalledOnce();
  });
});
