import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileNotificationsRealtimeTick } from "./useMobileNotificationsRealtimeTick";

type Listener = { table: string; topic: string; onEvent: () => void };
type Subscription = { listeners: Listener[]; hooks: { onReconnectAfterError?: () => void } };
const subscriptions: Subscription[] = [];

vi.mock("@dubgrid/realtime-core", () => ({
  userTopic: (userId: string) => `user:${userId}`,
  subscribeToTableChanges: (
    _client: unknown,
    listeners: Listener[],
    hooks: Subscription["hooks"],
  ) => {
    subscriptions.push({ listeners, hooks });
    return () => {};
  },
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }),
}));

beforeEach(() => {
  subscriptions.length = 0;
});

describe("useMobileNotificationsRealtimeTick", () => {
  it("does nothing when userId is missing", () => {
    renderHook(() => useMobileNotificationsRealtimeTick({ userId: null, onChange: vi.fn() }));

    expect(subscriptions).toHaveLength(0);
  });

  it("listens for the person's alerts on their own topic", () => {
    renderHook(() => useMobileNotificationsRealtimeTick({ userId: "user-1", onChange: vi.fn() }));

    expect(subscriptions[0].listeners.map(({ table, topic }) => [table, topic])).toEqual([
      ["notifications", "user:user-1"],
    ]);
  });

  it("calls onChange on a change and on reconnect after an error", () => {
    const onChange = vi.fn();

    renderHook(() => useMobileNotificationsRealtimeTick({ userId: "user-1", onChange }));

    subscriptions[0].listeners[0].onEvent();
    expect(onChange).toHaveBeenCalledTimes(1);

    subscriptions[0].hooks.onReconnectAfterError?.();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
