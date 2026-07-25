import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobileShiftRequestsRealtime } from "./useMobileShiftRequestsRealtime";

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

describe("useMobileShiftRequestsRealtime", () => {
  it("does nothing when orgId is missing", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();

    renderHook(() => useMobileShiftRequestsRealtime({ orgId: null, onChange: vi.fn() }));

    expect(channelNames).toHaveLength(0);
  });

  it("subscribes to a unique per-mount channel name filtered on shift_requests", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();

    renderHook(() => useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }));

    expect(channelNames).toHaveLength(1);
    expect(channelNames[0]).toMatch(/^shift_requests_org-1:/);
    expect(mockChannel.onCalls[0]?.filter).toEqual({
      event: "*",
      schema: "public",
      table: "shift_requests",
      filter: "org_id=eq.org-1",
    });
  });

  it("calls onChange when the table changes and on reconnect after an error", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();
    const onChange = vi.fn();

    renderHook(() => useMobileShiftRequestsRealtime({ orgId: "org-1", onChange }));

    mockChannel.onCalls[0]?.handler();
    expect(onChange).toHaveBeenCalledTimes(1);

    mockChannel.emitStatus("CHANNEL_ERROR", new Error("boom"));
    mockChannel.emitStatus("SUBSCRIBED");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes on cleanup", () => {
    channelNames.length = 0;
    mockChannel = createMockChannel();
    removeChannel.mockClear();

    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );
    unmount();

    expect(removeChannel).toHaveBeenCalledWith(mockChannel.channel);
  });
});
