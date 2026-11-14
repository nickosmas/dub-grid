import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePermissionsRealtime } from "./useMobilePermissionsRealtime";

type Listener = { table: string; topic: string; event?: string; onEvent: () => void };
type Subscription = { listeners: Listener[]; released: boolean };
const subscriptions: Subscription[] = [];

vi.mock("@dubgrid/realtime-core", () => ({
  userTopic: (userId: string) => `user:${userId}`,
  subscribeToTableChanges: (_client: unknown, listeners: Listener[]) => {
    const subscription = { listeners, released: false };
    subscriptions.push(subscription);
    return () => {
      subscription.released = true;
    };
  },
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }),
}));

beforeEach(() => {
  subscriptions.length = 0;
});

function mount(refetchQueries = vi.fn()) {
  return renderHook(() =>
    useMobilePermissionsRealtime({
      accessToken: "token-1",
      userId: "user-1",
      queryClient: { refetchQueries } as never,
    }),
  );
}

describe("useMobilePermissionsRealtime", () => {
  it("does nothing when accessToken or userId is missing", () => {
    renderHook(() =>
      useMobilePermissionsRealtime({
        accessToken: null,
        userId: null,
        queryClient: { refetchQueries: vi.fn() } as never,
      }),
    );

    expect(subscriptions).toHaveLength(0);
  });

  it("listens for membership and staff record updates on the person's own topic", () => {
    mount();

    expect(
      subscriptions[0].listeners.map(({ table, topic, event }) => [table, topic, event]),
    ).toEqual([
      ["organization_memberships", "user:user-1", "UPDATE"],
      ["employees", "user:user-1", "UPDATE"],
    ]);
  });

  it("refetches the active bootstrap query when a membership changes", () => {
    const refetchQueries = vi.fn();
    mount(refetchQueries);

    subscriptions[0].listeners[0].onEvent();

    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["mobile", "bootstrap"],
      type: "active",
    });
  });

  it("leaves the topic on cleanup", () => {
    const { unmount } = mount();

    unmount();

    expect(subscriptions[0].released).toBe(true);
  });
});
