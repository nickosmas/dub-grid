import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

// The channel registry is module-level and keyed on the org, so every case
// unmounts what it mounts; a leaked mount would make the next case join a
// channel instead of opening one.
beforeEach(() => {
  channelNames.length = 0;
  removeChannel.mockClear();
  mockChannel = createMockChannel();
});

describe("useMobileShiftRequestsRealtime", () => {
  it("does nothing when orgId is missing", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: null, onChange: vi.fn() }),
    );
    unmount();

    expect(channelNames).toHaveLength(0);
  });

  it("subscribes to one channel filtered on the org's shift_requests", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );

    expect(channelNames).toHaveLength(1);
    expect(channelNames[0]).toMatch(/^shift_requests_org-1:/);
    expect(mockChannel.onCalls[0]?.filter).toEqual({
      event: "*",
      schema: "public",
      table: "shift_requests",
      filter: "org_id=eq.org-1",
    });
    unmount();
  });

  it("calls onChange when the table changes and on reconnect after an error", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange }),
    );

    mockChannel.onCalls[0]?.handler();
    expect(onChange).toHaveBeenCalledTimes(1);

    mockChannel.emitStatus("CHANNEL_ERROR", new Error("boom"));
    mockChannel.emitStatus("SUBSCRIBED");
    expect(onChange).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("unsubscribes on cleanup", () => {
    const { unmount } = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );
    unmount();

    expect(removeChannel).toHaveBeenCalledWith(mockChannel.channel);
  });

  // Build plan item 35: the Schedule, Requests and Team screens all mount
  // this under native tabs. They used to open three channels and refetch
  // three times per row change.
  it("shares one channel across simultaneous mounts and fans events out to each", () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = renderHook(() => useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: first }));
    const b = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: second }),
    );

    expect(channelNames).toHaveLength(1);

    mockChannel.onCalls[0]?.handler();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // The first screen leaving must not close the channel the second still holds.
    a.unmount();
    expect(removeChannel).not.toHaveBeenCalled();
    mockChannel.onCalls[0]?.handler();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    b.unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("keeps the channel when onChange changes identity", () => {
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onChange }: { onChange: () => void }) =>
        useMobileShiftRequestsRealtime({ orgId: "org-1", onChange }),
      { initialProps: { onChange: onChange1 } },
    );

    rerender({ onChange: onChange2 });
    expect(channelNames).toHaveLength(1);
    expect(removeChannel).not.toHaveBeenCalled();

    mockChannel.onCalls[0]?.handler();
    expect(onChange1).not.toHaveBeenCalled();
    expect(onChange2).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("opens separate channels for different organizations", () => {
    const a = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-1", onChange: vi.fn() }),
    );
    const b = renderHook(() =>
      useMobileShiftRequestsRealtime({ orgId: "org-2", onChange: vi.fn() }),
    );

    expect(channelNames).toHaveLength(2);
    expect(channelNames[0]).toMatch(/^shift_requests_org-1:/);
    expect(channelNames[1]).toMatch(/^shift_requests_org-2:/);
    a.unmount();
    b.unmount();
  });
});
