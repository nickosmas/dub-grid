import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileShiftRequestsRealtime } from "./useMobileShiftRequestsRealtime";

type Listener = { table: string; topic: string; onEvent: () => void };
type Subscription = {
  listeners: Listener[];
  hooks: { onReconnectAfterError?: () => void };
  released: boolean;
};
const subscriptions: Subscription[] = [];

vi.mock("@dubgrid/realtime-core", () => ({
  orgTopic: (orgId: string) => `org:${orgId}`,
  subscribeToTableChanges: (
    _client: unknown,
    listeners: Listener[],
    hooks: Subscription["hooks"],
  ) => {
    const subscription = { listeners, hooks, released: false };
    subscriptions.push(subscription);
    return () => {
      subscription.released = true;
    };
  },
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }),
}));

const change = (index = 0) => subscriptions[index]?.listeners[0]?.onEvent();

// The channel registry is module-level and keyed on the org, so every case
// unmounts what it mounts; a leaked mount would make the next case join a
// subscription instead of opening one.
beforeEach(() => {
  subscriptions.length = 0;
});

describe("useMobileShiftRequestsRealtime", () => {
  it("does nothing when orgId is missing", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: null, onChange: vi.fn() }),
    );
    unmount();

    expect(subscriptions).toHaveLength(0);
  });

  it("listens for the organization's shift requests on its topic", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].listeners.map(({ table, topic }) => [table, topic])).toEqual([
      ["shift_requests", "org:org-1"],
    ]);
    unmount();
  });

  it("calls onChange when the table changes and on reconnect after an error", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange }),
    );

    change();
    expect(onChange).toHaveBeenCalledTimes(1);

    subscriptions[0].hooks.onReconnectAfterError?.();
    expect(onChange).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("unsubscribes on cleanup", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );
    unmount();

    expect(subscriptions[0].released).toBe(true);
  });

  // Build plan item 35: the Schedule, Requests and Team screens all mount
  // this under native tabs. They used to open three channels and refetch
  // three times per row change.
  it("shares one subscription across simultaneous mounts and fans events out to each", () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = renderHook(() => useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: first }));
    const b = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: second }),
    );

    expect(subscriptions).toHaveLength(1);

    change();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // The first screen leaving must not close the channel the second still holds.
    a.unmount();
    expect(subscriptions[0].released).toBe(false);
    change();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    b.unmount();
    expect(subscriptions[0].released).toBe(true);
  });

  it("keeps the subscription when onChange changes identity", () => {
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onChange }: { onChange: () => void }) =>
        useMobileShiftRequestsRealtime({ orgId: "org-1", onChange }),
      { initialProps: { onChange: onChange1 } },
    );

    rerender({ onChange: onChange2 });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].released).toBe(false);

    change();
    expect(onChange1).not.toHaveBeenCalled();
    expect(onChange2).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("opens separate subscriptions for different organizations", () => {
    const a = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );
    const b = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-2", onChange: vi.fn() }),
    );

    expect(subscriptions.map((entry) => entry.listeners[0].topic)).toEqual([
      "org:org-1",
      "org:org-2",
    ]);
    a.unmount();
    b.unmount();
  });
});
