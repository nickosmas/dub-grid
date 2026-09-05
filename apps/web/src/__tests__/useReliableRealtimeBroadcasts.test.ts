import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useReliableRealtimeBroadcasts } from "@/hooks/useReliableRealtimeBroadcasts";

function createChannel() {
  return {
    state: "joined",
    send: vi.fn().mockResolvedValue("ok"),
  } as unknown as RealtimeChannel & {
    state: string;
    send: ReturnType<typeof vi.fn>;
  };
}

function createChannelRef(channel: RealtimeChannel): MutableRefObject<RealtimeChannel | null> {
  return { current: channel };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useReliableRealtimeBroadcasts", () => {
  it("queues broadcasts until the channel is joined", async () => {
    const channel = createChannel();
    channel.state = "closed";
    const { result } = renderHook(() => useReliableRealtimeBroadcasts(createChannelRef(channel)));

    act(() => {
      result.current.sendBroadcast(
        "schedule_published",
        { published: true },
        { key: "schedule_published" },
      );
    });

    expect(channel.send).not.toHaveBeenCalled();

    channel.state = "joined";
    await act(async () => {
      await result.current.flushPendingBroadcasts();
    });

    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "schedule_published",
      payload: { published: true },
    });
  });

  it("merges keyed broadcasts before sending", async () => {
    const channel = createChannel();
    channel.state = "closed";
    const { result } = renderHook(() => useReliableRealtimeBroadcasts(createChannelRef(channel)));

    act(() => {
      result.current.sendBroadcast(
        "draft_changed",
        { shifts: { a: { label: "D" } } },
        {
          key: "draft_changed",
          merge: (current, next) => ({
            shifts: {
              ...((current.shifts as Record<string, unknown> | undefined) ?? {}),
              ...((next.shifts as Record<string, unknown> | undefined) ?? {}),
            },
          }),
        },
      );
      result.current.sendBroadcast(
        "draft_changed",
        { shifts: { b: null } },
        {
          key: "draft_changed",
          merge: (current, next) => ({
            shifts: {
              ...((current.shifts as Record<string, unknown> | undefined) ?? {}),
              ...((next.shifts as Record<string, unknown> | undefined) ?? {}),
            },
          }),
        },
      );
    });

    channel.state = "joined";
    await act(async () => {
      await result.current.flushPendingBroadcasts();
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "draft_changed",
      payload: {
        shifts: {
          a: { label: "D" },
          b: null,
        },
      },
    });
  });

  it("retries failed sends until the broadcast goes through", async () => {
    vi.useFakeTimers();
    const channel = createChannel();
    channel.send.mockResolvedValueOnce("timed out").mockResolvedValueOnce("ok");

    const { result } = renderHook(() => useReliableRealtimeBroadcasts(createChannelRef(channel)));

    act(() => {
      result.current.sendBroadcast("drafts_discarded", {}, { key: "drafts_discarded" });
    });

    expect(channel.send).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.send).toHaveBeenLastCalledWith({
      type: "broadcast",
      event: "drafts_discarded",
      payload: {},
    });
  });

  describe("retry hardening", () => {
    it("backs off between attempts instead of retrying at a flat interval", async () => {
      vi.useFakeTimers();
      try {
        const channel = createChannel();
        channel.send.mockResolvedValue("error");
        const { result } = renderHook(() =>
          useReliableRealtimeBroadcasts(createChannelRef(channel)),
        );

        act(() => result.current.sendBroadcast("cell_locked", { cellKey: "c1" }, { key: "k" }));
        await act(async () => {});
        const afterFirst = channel.send.mock.calls.length;

        // A flat 400ms retry would fire many times in this window; backoff
        // should have spread the attempts out well beyond that.
        await act(async () => {
          vi.advanceTimersByTime(400);
        });
        const afterShortWait = channel.send.mock.calls.length;

        expect(afterFirst).toBeGreaterThan(0);
        expect(afterShortWait - afterFirst).toBeLessThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops retrying and reports degraded delivery", async () => {
      vi.useFakeTimers();
      try {
        const channel = createChannel();
        channel.send.mockResolvedValue("error");
        const { result } = renderHook(() =>
          useReliableRealtimeBroadcasts(createChannelRef(channel)),
        );

        act(() => result.current.sendBroadcast("cell_locked", { cellKey: "c1" }, { key: "k" }));
        for (let i = 0; i < 14; i += 1) {
          await act(async () => {
            vi.advanceTimersByTime(20_000);
          });
        }

        expect(result.current.isBroadcastDegraded).toBe(true);
        expect(channel.send.mock.calls.length).toBeLessThanOrEqual(14);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the degraded flag once the queue drains", async () => {
      vi.useFakeTimers();
      try {
        const channel = createChannel();
        channel.send.mockResolvedValue("error");
        const { result } = renderHook(() =>
          useReliableRealtimeBroadcasts(createChannelRef(channel)),
        );

        act(() => result.current.sendBroadcast("cell_locked", { cellKey: "c1" }, { key: "k" }));
        for (let i = 0; i < 14; i += 1) {
          await act(async () => {
            vi.advanceTimersByTime(20_000);
          });
        }
        expect(result.current.isBroadcastDegraded).toBe(true);

        channel.send.mockResolvedValue("ok");
        await act(async () => {
          await result.current.flushPendingBroadcasts();
        });

        expect(result.current.isBroadcastDegraded).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
