import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCellLocks } from "@/hooks/useCellLocks";

type PresenceRecord = {
  editingCell: string | null;
  userId: string;
  userName: string;
  editorSessionId: string;
  canLockCells?: boolean;
  isScheduleEditor?: boolean;
  lockRevision?: number;
  editingSeriesId?: string | null;
};

function createChannel() {
  let state: Record<string, PresenceRecord[]> = {};
  return {
    state: "joined",
    send: vi.fn().mockResolvedValue("ok"),
    track: vi.fn().mockResolvedValue("ok"),
    untrack: vi.fn().mockResolvedValue("ok"),
    presenceState: vi.fn(() => state),
    setPresenceState(next: Record<string, PresenceRecord[]>) {
      state = next;
    },
  } as unknown as RealtimeChannel & {
    setPresenceState: (next: Record<string, PresenceRecord[]>) => void;
    send: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
  };
}

function createChannelRef(channel: RealtimeChannel): MutableRefObject<RealtimeChannel | null> {
  return { current: channel };
}

describe("useCellLocks", () => {
  it("removes presence on logout even after the local user has cleared", async () => {
    const channel = createChannel();
    const channelRef = createChannelRef(channel);
    type HookProps = {
      currentUser: { id: string; name: string } | null;
    };
    const { result, rerender } = renderHook(
      ({ currentUser }: HookProps) =>
        useCellLocks(channelRef, currentUser, "session-1", true, true),
      {
        initialProps: {
          currentUser: { id: "user-1", name: "Alex Admin" },
        } as HookProps,
      },
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });

    channel.untrack.mockClear();

    rerender({ currentUser: null });

    await act(async () => {
      result.current.unlockCell({ removePresence: true });
    });

    expect(channel.untrack).toHaveBeenCalledTimes(1);
  });

  it("tracks presence and broadcasts a hard lock for note-only editors", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });

    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        editingCell: "emp-1_2026-04-12",
        editorSessionId: "session-1",
        isScheduleEditor: true,
        canLockCells: true,
      }),
    );
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "broadcast",
        event: "cell_locked",
        payload: expect.objectContaining({
          cellKey: "emp-1_2026-04-12",
          editorSessionId: "session-1",
        }),
      }),
    );
  });

  it("replays the latest presence after the channel reconnects", async () => {
    const channel = createChannel();
    channel.state = "closed";

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });

    expect(channel.track).not.toHaveBeenCalled();

    channel.state = "joined";
    await act(async () => {
      await result.current.refreshPresence();
    });

    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        editingCell: "emp-1_2026-04-12",
        editorSessionId: "session-1",
        userId: "user-1",
      }),
    );
  });

  it("permanently untracks an ended local editor session and refuses to relock", async () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
      result.current.endCurrentSession();
    });

    expect(result.current.isSessionEnded).toBe(true);
    expect(result.current.getCurrentCell()).toBeNull();
    await act(async () => {
      await result.current.refreshPresence();
      result.current.lockCell("emp-1_2026-04-13");
    });

    expect(result.current.getCurrentCell()).toBeNull();
    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(channel.untrack).toHaveBeenCalled();
  });

  it("removes a terminated remote session and its lock immediately", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-2_2026-04-12",
        userId: "user-1",
        userName: "Alex Admin",
        editorSessionId: "session-2",
        lockRevision: 1,
      });
      result.current.removeRemoteSession("session-2");
    });

    expect(result.current.getCellLock("emp-2_2026-04-12")).toBeNull();

    channel.setPresenceState({
      "user-1": [
        {
          editingCell: "emp-2_2026-04-12",
          userId: "user-1",
          userName: "Alex Admin",
          editorSessionId: "session-2",
          lockRevision: 1,
        },
      ],
    });
    act(() => result.current.syncPresence());
    expect(result.current.getCellLock("emp-2_2026-04-12")).toBeNull();
  });

  it("shows note-only editors online and hard-locks their whole cell", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-2": [
        {
          editingCell: "emp-2_2026-04-12",
          userId: "user-2",
          userName: "Nora Notes",
          editorSessionId: "session-2",
          canLockCells: false,
          isScheduleEditor: true,
          lockRevision: 3,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toEqual([
      expect.objectContaining({
        userId: "user-2",
        userName: "Nora Notes",
        editingCell: "emp-2_2026-04-12",
        canLockCells: false,
        sessionCount: 1,
      }),
    ]);
    expect(result.current.getCellLock("emp-2_2026-04-12")).toEqual(
      expect.objectContaining({
        userId: "user-2",
        owner: "other_account",
      }),
    );
  });

  it("ignores stale unlock broadcasts for a newer lock revision", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-3_2026-04-12",
        userId: "user-2",
        userName: "Riley RN",
        editorSessionId: "session-2",
        lockRevision: 4,
        canLockCells: true,
      });
      result.current.handleUnlockBroadcast({
        userId: "user-2",
        editorSessionId: "session-2",
        cellKey: "emp-3_2026-04-12",
        lockRevision: 3,
      });
    });

    expect(result.current.getCellLock("emp-3_2026-04-12")).toEqual(
      expect.objectContaining({
        userId: "user-2",
        editorSessionId: "session-2",
        lockRevision: 4,
      }),
    );
  });

  it("reconciles stale optimistic locks away on the next presence sync", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-4_2026-04-12",
        userId: "user-3",
        userName: "Jamie Charge",
        editorSessionId: "session-3",
        lockRevision: 2,
        canLockCells: true,
      });
    });
    expect(result.current.getCellLock("emp-4_2026-04-12")).not.toBeNull();

    channel.setPresenceState({});
    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.getCellLock("emp-4_2026-04-12")).toBeNull();
  });

  it("does not let stale presence sync roll back a newer remote movement broadcast", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-2": [
        {
          editingCell: "emp-8_2026-04-12",
          userId: "user-2",
          userName: "Riley RN",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 1,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-8_2026-04-13",
        userId: "user-2",
        userName: "Riley RN",
        editorSessionId: "session-2",
        lockRevision: 2,
        canLockCells: true,
      });
    });

    expect(result.current.getCellLock("emp-8_2026-04-12")).toBeNull();
    expect(result.current.getCellLock("emp-8_2026-04-13")).toEqual(
      expect.objectContaining({
        userId: "user-2",
        editorSessionId: "session-2",
        cellKey: "emp-8_2026-04-13",
        lockRevision: 2,
      }),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.getCellLock("emp-8_2026-04-12")).toBeNull();
    expect(result.current.getCellLock("emp-8_2026-04-13")).toEqual(
      expect.objectContaining({
        userId: "user-2",
        editorSessionId: "session-2",
        cellKey: "emp-8_2026-04-13",
        lockRevision: 2,
      }),
    );
    expect(result.current.onlineUsers).toEqual([
      expect.objectContaining({
        userId: "user-2",
        editingCell: "emp-8_2026-04-13",
        sessionCount: 1,
      }),
    ]);
  });

  it("lets an equal-revision presence snapshot win when it reflects the latest server state", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-9_2026-04-13",
        userId: "user-2",
        userName: "Riley RN",
        editorSessionId: "session-2",
        lockRevision: 2,
        canLockCells: true,
      });
    });

    channel.setPresenceState({
      "user-2": [
        {
          editingCell: "emp-9_2026-04-14",
          userId: "user-2",
          userName: "Riley Updated",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 2,
        },
      ],
    });

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.getCellLock("emp-9_2026-04-13")).toBeNull();
    expect(result.current.getCellLock("emp-9_2026-04-14")).toEqual(
      expect.objectContaining({
        userId: "user-2",
        userName: "Riley Updated",
        editorSessionId: "session-2",
        cellKey: "emp-9_2026-04-14",
        lockRevision: 2,
      }),
    );
    expect(result.current.onlineUsers).toEqual([
      expect.objectContaining({
        userId: "user-2",
        userName: "Riley Updated",
        editingCell: "emp-9_2026-04-14",
        sessionCount: 1,
      }),
    ]);
  });

  it("clears cached presence avatars and locks when the channel is reset", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-2": [
        {
          editingCell: "emp-7_2026-04-12",
          userId: "user-2",
          userName: "Riley RN",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 5,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toHaveLength(1);
    expect(result.current.getCellLock("emp-7_2026-04-12")).not.toBeNull();

    act(() => {
      result.current.clearPresenceState();
    });

    expect(result.current.onlineUsers).toEqual([]);
    expect(result.current.getCellLock("emp-7_2026-04-12")).toBeNull();
  });

  it("hides another tab for the same user from presence and hard-locks its cell", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-1": [
        {
          editingCell: "emp-5_2026-04-12",
          userId: "user-1",
          userName: "Alex Admin",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 6,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toEqual([]);
    expect(result.current.sameAccountSessions).toEqual([
      {
        editorSessionId: "session-2",
        editingCell: "emp-5_2026-04-12",
      },
    ]);
    expect(result.current.getCellLock("emp-5_2026-04-12")).toEqual(
      expect.objectContaining({
        userId: "user-1",
        editorSessionId: "session-2",
        owner: "same_account",
      }),
    );
    expect(result.current.getCellActivity("emp-5_2026-04-12")).toEqual(
      expect.objectContaining({
        userId: "user-1",
        isSameUser: true,
        sessionCount: 1,
      }),
    );
  });

  it("hides an idle same-account tab without creating a lock", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-1": [
        {
          editingCell: null,
          userId: "user-1",
          userName: "Alex Admin",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 2,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toEqual([]);
    expect(result.current.sameAccountSessions).toEqual([
      {
        editorSessionId: "session-2",
        editingCell: null,
      },
    ]);
    expect(result.current.lockedCells.size).toBe(0);
  });

  it("represents each same-account editor session once and removes ended sessions", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-1": [
        {
          editingCell: null,
          userId: "user-1",
          userName: "Alex Admin",
          editorSessionId: "session-3",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 1,
        },
        {
          editingCell: "emp-6_2026-04-12",
          userId: "user-1",
          userName: "Alex Admin",
          editorSessionId: "session-2",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 4,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toEqual([]);
    expect(result.current.sameAccountSessions).toEqual([
      {
        editorSessionId: "session-2",
        editingCell: "emp-6_2026-04-12",
      },
      { editorSessionId: "session-3", editingCell: null },
    ]);

    act(() => {
      result.current.removeRemoteSession("session-2");
    });

    expect(result.current.sameAccountSessions).toEqual([
      { editorSessionId: "session-3", editingCell: null },
    ]);
  });

  it("deduplicates multiple sessions for the same user into one avatar entry", () => {
    const channel = createChannel();
    channel.setPresenceState({
      "user-2": [
        {
          editingCell: null,
          userId: "user-2",
          userName: "Riley RN",
          editorSessionId: "session-2a",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 1,
        },
        {
          editingCell: "emp-6_2026-04-12",
          userId: "user-2",
          userName: "Riley RN",
          editorSessionId: "session-2b",
          canLockCells: true,
          isScheduleEditor: true,
          lockRevision: 4,
        },
      ],
    });

    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.syncPresence();
    });

    expect(result.current.onlineUsers).toHaveLength(1);
    expect(result.current.onlineUsers[0]).toEqual(
      expect.objectContaining({
        userId: "user-2",
        editingCell: "emp-6_2026-04-12",
        sessionCount: 2,
      }),
    );
  });

  it("carries a recurring-series identity into presence and remote locks", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12", { seriesId: "series-1" });
    });

    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({ editingSeriesId: "series-1" }),
    );
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ seriesId: "series-1" }),
      }),
    );

    act(() => {
      result.current.handleLockBroadcast({
        cellKey: "emp-2_2026-04-13",
        userId: "user-2",
        userName: "Riley RN",
        editorSessionId: "session-2",
        lockRevision: 3,
        seriesId: "series-2",
      });
    });

    expect(result.current.getCellLock("emp-2_2026-04-13")).toEqual(
      expect.objectContaining({ seriesId: "series-2" }),
    );
  });

  it("takes no lock until an identity exists, then locks once it arrives", () => {
    // lockCell is a no-op without a user, so an identity that resolved late
    // left the editor visibly in a cell while holding no lock on it.
    const channel = createChannel();
    type Props = { currentUser: { id: string; name: string } | null };
    const { result, rerender } = renderHook(
      ({ currentUser }: Props) =>
        useCellLocks(createChannelRef(channel), currentUser, "session-1", true, true),
      { initialProps: { currentUser: null } as Props },
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });
    expect(result.current.getCurrentCell()).toBeNull();
    expect(channel.track).not.toHaveBeenCalled();

    rerender({ currentUser: { id: "user-1", name: "Alex Admin" } });
    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });

    expect(result.current.getCurrentCell()).toBe("emp-1_2026-04-12");
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cell_locked",
        payload: expect.objectContaining({ cellKey: "emp-1_2026-04-12" }),
      }),
    );
  });

  it("releases the held cell as soon as the editor closes it", () => {
    const channel = createChannel();
    const { result } = renderHook(() =>
      useCellLocks(
        createChannelRef(channel),
        { id: "user-1", name: "Alex Admin" },
        "session-1",
        true,
        true,
      ),
    );

    act(() => {
      result.current.lockCell("emp-1_2026-04-12");
    });
    expect(result.current.getCurrentCell()).toBe("emp-1_2026-04-12");

    channel.send.mockClear();
    act(() => {
      result.current.unlockCell();
    });

    expect(result.current.getCurrentCell()).toBeNull();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cell_unlocked",
        payload: expect.objectContaining({ cellKey: "emp-1_2026-04-12" }),
      }),
    );
  });

  describe("presence reflects immediately", () => {
    const remotePresence = (overrides: Partial<PresenceRecord> = {}): PresenceRecord => ({
      editingCell: null,
      userId: "user-2",
      userName: "Riley RN",
      editorSessionId: "session-2",
      canLockCells: true,
      isScheduleEditor: true,
      lockRevision: 1,
      ...overrides,
    });

    const renderWithPresence = (channel: ReturnType<typeof createChannel>) =>
      renderHook(() =>
        useCellLocks(
          createChannelRef(channel),
          { id: "user-1", name: "Alex Admin" },
          "session-1",
          true,
          true,
        ),
      );

    it("shows an editor as soon as they appear in presence", () => {
      const channel = createChannel();
      const { result } = renderWithPresence(channel);

      act(() => result.current.syncPresence());
      expect(result.current.onlineUsers).toEqual([]);

      act(() => {
        channel.setPresenceState({ "user-2": [remotePresence()] });
        result.current.syncPresence();
      });

      expect(result.current.onlineUsers).toEqual([
        expect.objectContaining({ userId: "user-2", userName: "Riley RN" }),
      ]);
    });

    it("removes an editor immediately when they leave presence", () => {
      // No grace window: navigating away from the schedule untracks presence,
      // and every peer reflects that on the next sync rather than holding a
      // stale avatar.
      const channel = createChannel();
      channel.setPresenceState({ "user-2": [remotePresence()] });
      const { result } = renderWithPresence(channel);

      act(() => result.current.syncPresence());
      expect(result.current.onlineUsers).toHaveLength(1);

      act(() => {
        channel.setPresenceState({});
        result.current.syncPresence();
      });

      expect(result.current.onlineUsers).toEqual([]);
    });

    it("releases a departed editor's cell lock immediately", () => {
      const channel = createChannel();
      channel.setPresenceState({
        "user-2": [remotePresence({ editingCell: "emp-9_2026-04-12" })],
      });
      const { result } = renderWithPresence(channel);

      act(() => result.current.syncPresence());
      expect(result.current.getCellLock("emp-9_2026-04-12")).not.toBeNull();

      act(() => {
        channel.setPresenceState({});
        result.current.syncPresence();
      });

      expect(result.current.getCellLock("emp-9_2026-04-12")).toBeNull();
    });

    it("counts one person once across several of their sessions", () => {
      const channel = createChannel();
      channel.setPresenceState({
        "user-2": [
          remotePresence({ editorSessionId: "session-2a" }),
          remotePresence({ editorSessionId: "session-2b" }),
        ],
      });
      const { result } = renderWithPresence(channel);

      act(() => result.current.syncPresence());

      expect(result.current.onlineUsers).toEqual([
        expect.objectContaining({ userId: "user-2", sessionCount: 2 }),
      ]);
    });
  });
});
