import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  useSchedulePresence,
  parseEditingCellBroadcast,
  EDITING_CELL_MIN_INTERVAL_MS,
  EDITING_CELL_REANNOUNCE_MS,
  EDITING_CELL_STALE_MS,
} from "@/hooks/useSchedulePresence";

const MINE = "session-1";
const THEIRS = "session-2";
const CELL = "emp-1_2026-04-12";

type PresenceRecord = {
  userId: string;
  userName: string;
  editorSessionId: string;
  canLockCells?: boolean;
  isScheduleEditor?: boolean;
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
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function render(channel: RealtimeChannel, send?: ReturnType<typeof vi.fn>) {
  const channelRef: MutableRefObject<RealtimeChannel | null> = { current: channel };
  return renderHook(() =>
    useSchedulePresence(channelRef, { id: "user-1", name: "Alex Admin" }, MINE, true, true, send),
  );
}

const peer = (overrides: Partial<PresenceRecord> = {}): PresenceRecord => ({
  userId: "user-2",
  userName: "Riley RN",
  editorSessionId: THEIRS,
  isScheduleEditor: true,
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("presence identity", () => {
  // The bug this design replaces came from presence being republished on every
  // cell click until it hit the events-per-second limit.
  it("publishes identity once and never again when the user moves", async () => {
    const channel = createChannel();
    const { result } = render(channel);
    await waitFor(() => expect(channel.track).toHaveBeenCalledTimes(1));

    act(() => result.current.announceEditingCell(CELL));
    act(() => result.current.announceEditingCell("emp-2_2026-04-13"));
    act(() => result.current.announceEditingCell(null));

    expect(channel.track).toHaveBeenCalledTimes(1);
  });

  it("carries no cell information in the presence payload", async () => {
    const channel = createChannel();
    render(channel);
    await waitFor(() => expect(channel.track).toHaveBeenCalled());

    const payload = channel.track.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ userId: "user-1", editorSessionId: MINE });
    expect(payload).not.toHaveProperty("editingCell");
    expect(payload).not.toHaveProperty("lockRevision");
  });

  it("withdraws presence when asked", async () => {
    const channel = createChannel();
    const { result } = render(channel);
    await waitFor(() => expect(channel.track).toHaveBeenCalled());

    await act(async () => {
      await result.current.refreshPresence({ removePresence: true });
    });
    expect(channel.untrack).toHaveBeenCalled();
  });

  it("builds the roster from presence identity alone", () => {
    const channel = createChannel();
    const { result } = render(channel);

    channel.setPresenceState({ [THEIRS]: [peer()] });
    act(() => result.current.syncPresence());

    expect(result.current.onlineUsers).toHaveLength(1);
    expect(result.current.onlineUsers[0]).toMatchObject({
      userId: "user-2",
      userName: "Riley RN",
      editingCell: null,
    });
  });
});

describe("announcing where we are", () => {
  it("sends the first move immediately, with no delay", () => {
    const channel = createChannel();
    const send = vi.fn();
    const { result } = render(channel, send);

    act(() => result.current.announceEditingCell(CELL));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "editing_cell",
      { editorSessionId: MINE, cellKey: CELL },
      expect.objectContaining({ key: expect.stringContaining(MINE) }),
    );
  });

  it("caps a burst but still delivers the final position", () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const send = vi.fn();
    const { result } = render(channel, send);

    act(() => result.current.announceEditingCell("cell-a"));
    act(() => result.current.announceEditingCell("cell-b"));
    act(() => result.current.announceEditingCell("cell-c"));

    // Leading edge only so far; the rest collapsed into one pending send.
    expect(send).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_MIN_INTERVAL_MS + 10);
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual({ editorSessionId: MINE, cellKey: "cell-c" });
  });

  it("re-announces while a cell is held, so a dropped message heals", () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const send = vi.fn();
    const { result } = render(channel, send);

    act(() => result.current.announceEditingCell(CELL));
    send.mockClear();

    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_REANNOUNCE_MS + 10);
    });

    expect(send).toHaveBeenCalledWith(
      "editing_cell",
      { editorSessionId: MINE, cellKey: CELL },
      expect.anything(),
    );
  });

  it("stops re-announcing once the cell is left", () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const send = vi.fn();
    const { result } = render(channel, send);

    act(() => result.current.announceEditingCell(CELL));
    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_MIN_INTERVAL_MS + 10);
    });
    act(() => result.current.announceEditingCell(null));
    send.mockClear();

    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_REANNOUNCE_MS * 2);
    });

    expect(send).not.toHaveBeenCalled();
  });
});

describe("peer positions", () => {
  it("shows where another editor is", () => {
    const channel = createChannel();
    const { result } = render(channel);
    channel.setPresenceState({ [THEIRS]: [peer()] });
    act(() => result.current.syncPresence());

    act(() =>
      result.current.handleEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: CELL }),
    );

    expect(result.current.getCellEditor(CELL)).toMatchObject({ userName: "Riley RN" });
    expect(result.current.onlineUsers[0].editingCell).toBe(CELL);
  });

  it("clears the marker when that editor leaves the cell", () => {
    const channel = createChannel();
    const { result } = render(channel);
    channel.setPresenceState({ [THEIRS]: [peer()] });
    act(() => result.current.syncPresence());

    act(() =>
      result.current.handleEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: CELL }),
    );
    act(() =>
      result.current.handleEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: null }),
    );

    expect(result.current.getCellEditor(CELL)).toBeNull();
  });

  // A crashed tab never says goodbye, so its marker has to fade on its own.
  it("expires a position nobody has refreshed", () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const { result } = render(channel);
    channel.setPresenceState({ [THEIRS]: [peer()] });
    act(() => result.current.syncPresence());
    act(() =>
      result.current.handleEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: CELL }),
    );
    expect(result.current.getCellEditor(CELL)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_STALE_MS + EDITING_CELL_REANNOUNCE_MS);
    });

    expect(result.current.getCellEditor(CELL)).toBeNull();
  });

  it("ignores an echo of our own position", () => {
    const channel = createChannel();
    const { result } = render(channel);

    act(() => result.current.handleEditingCellBroadcast({ editorSessionId: MINE, cellKey: CELL }));

    expect(result.current.getCellEditor(CELL)).toBeNull();
  });

  it("drops a removed session's marker with the session", () => {
    const channel = createChannel();
    const { result } = render(channel);
    channel.setPresenceState({ [THEIRS]: [peer()] });
    act(() => result.current.syncPresence());
    act(() =>
      result.current.handleEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: CELL }),
    );

    act(() => result.current.removeRemoteSession(THEIRS));

    expect(result.current.getCellEditor(CELL)).toBeNull();
    expect(result.current.onlineUsers).toHaveLength(0);
  });
});

describe("parseEditingCellBroadcast", () => {
  it("accepts a cell and a departure", () => {
    expect(parseEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: CELL })).toEqual({
      editorSessionId: THEIRS,
      cellKey: CELL,
    });
    expect(parseEditingCellBroadcast({ editorSessionId: THEIRS, cellKey: null })).toEqual({
      editorSessionId: THEIRS,
      cellKey: null,
    });
  });

  // Payloads arrive from the network, so a malformed one must be dropped rather
  // than allowed to corrupt the map.
  it.each([
    ["null", null],
    ["a non-object", "editing"],
    ["a missing session", { cellKey: CELL }],
    ["an empty session", { editorSessionId: "", cellKey: CELL }],
    ["a non-string cell", { editorSessionId: THEIRS, cellKey: 42 }],
  ])("rejects %s", (_label, payload) => {
    expect(parseEditingCellBroadcast(payload)).toBeNull();
  });
});

describe("session end", () => {
  it("withdraws presence and stops announcing", async () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const send = vi.fn();
    const { result } = render(channel, send);

    act(() => result.current.announceEditingCell(CELL));
    act(() => result.current.endCurrentSession());
    send.mockClear();

    act(() => {
      vi.advanceTimersByTime(EDITING_CELL_REANNOUNCE_MS * 2);
    });

    expect(result.current.isSessionEnded).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
