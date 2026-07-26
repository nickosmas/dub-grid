import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobileNotificationsRealtimeTick } from "./useMobileNotificationsRealtimeTick";

function createMockChannel() {
  const onCalls: Array<{ filter: Record<string, unknown>; handler: () => void }> = [];
  let subscribeCallback: ((status: string, err?: Error) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, unknown>, handler: () => void) => {
      onCalls.push({ filter, handler });
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

let mockChannel: ReturnType<typeof createMockChannel>;
const channelNames: string[] = [];
const removeChannel = vi.fn();

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({
    channel: (name: string) => {
      channelNames.push(name);
      return mockChannel.channel;
    },
    removeChannel,
  }),
}));

describe("useMobileNotificationsRealtimeTick", () => {
  it("does nothing when userId is missing", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();

    renderHook(() => useMobileNotificationsRealtimeTick({ userId: null, onChange: vi.fn() }));

    expect(channelNames).toHaveLength(0);
  });

  it("subscribes to a per-user notifications channel", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();

    renderHook(() => useMobileNotificationsRealtimeTick({ userId: "user-1", onChange: vi.fn() }));

    expect(channelNames[0]).toMatch(/^notifications:user:user-1:/);
    expect(mockChannel.onCalls[0]?.filter).toEqual({
      event: "*",
      schema: "public",
      table: "notifications",
      filter: "user_id=eq.user-1",
    });
  });

  it("calls onChange on event and on reconnect after an error", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();
    const onChange = vi.fn();

    renderHook(() => useMobileNotificationsRealtimeTick({ userId: "user-1", onChange }));

    mockChannel.onCalls[0]?.handler();
    expect(onChange).toHaveBeenCalledTimes(1);

    mockChannel.emitStatus("CHANNEL_ERROR", new Error("boom"));
    mockChannel.emitStatus("SUBSCRIBED");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
