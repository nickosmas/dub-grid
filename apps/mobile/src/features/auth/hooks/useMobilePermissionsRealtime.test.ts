import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobilePermissionsRealtime } from "./useMobilePermissionsRealtime";

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

const channels: ReturnType<typeof createMockChannel>[] = [];
const removeChannel = vi.fn();

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({
    channel: () => {
      const mock = createMockChannel();
      channels.push(mock);
      return mock.channel;
    },
    removeChannel,
  }),
}));

describe("useMobilePermissionsRealtime", () => {
  it("does nothing when accessToken or userId is missing", () => {
    renderHook(() =>
      useMobilePermissionsRealtime({
        accessToken: null,
        userId: null,
        queryClient: { refetchQueries: vi.fn() } as never,
      }),
    );

    expect(channels).toHaveLength(0);
  });

  it("subscribes to organization_memberships and employees UPDATE events for the user", () => {
    channels.length = 0;
    renderHook(() =>
      useMobilePermissionsRealtime({
        accessToken: "token-1",
        userId: "user-1",
        queryClient: { refetchQueries: vi.fn() } as never,
      }),
    );

    expect(channels).toHaveLength(2);
    expect(channels[0]?.onCalls[0]?.filter).toEqual({
      event: "UPDATE",
      schema: "public",
      table: "organization_memberships",
      filter: "user_id=eq.user-1",
    });
    expect(channels[1]?.onCalls[0]?.filter).toEqual({
      event: "UPDATE",
      schema: "public",
      table: "employees",
      filter: "user_id=eq.user-1",
    });
  });

  it("refetches the active bootstrap query when a membership row changes", () => {
    channels.length = 0;
    const refetchQueries = vi.fn();

    renderHook(() =>
      useMobilePermissionsRealtime({
        accessToken: "token-1",
        userId: "user-1",
        queryClient: { refetchQueries } as never,
      }),
    );

    channels[0]?.onCalls[0]?.handler();

    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["mobile", "bootstrap"],
      type: "active",
    });
  });

  it("unsubscribes both channels on cleanup", () => {
    channels.length = 0;
    removeChannel.mockClear();

    const { unmount } = renderHook(() =>
      useMobilePermissionsRealtime({
        accessToken: "token-1",
        userId: "user-1",
        queryClient: { refetchQueries: vi.fn() } as never,
      }),
    );

    unmount();

    expect(removeChannel).toHaveBeenCalledTimes(2);
  });
});
