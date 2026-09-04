"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type MutableRefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface OnlineUser {
  editorSessionId: string;
  userId: string;
  userName: string;
  editingCell: string | null;
  canLockCells: boolean;
  isSameUser: boolean;
  sessionCount: number;
}

export interface SameAccountEditorSession {
  editorSessionId: string;
  editingCell: string | null;
}

/**
 * Presence carries identity and nothing else.
 *
 * It used to carry the cell each editor had open, which meant every click
 * republished presence. `track()` appends a meta rather than replacing one, so
 * the payload grew with each move and a burst tripped the per-client
 * events-per-second limit, after which editors stopped appearing at all.
 * Identity is published once per connection and never again; where each editor
 * is sits on a separate broadcast that nothing depends on for correctness.
 */
interface PresencePayload {
  userId: string;
  userName: string;
  editorSessionId: string;
  canLockCells?: boolean;
  isScheduleEditor?: boolean;
}

interface RemoteEditorSession {
  editorSessionId: string;
  userId: string;
  userName: string;
  canLockCells: boolean;
  isScheduleEditor: boolean;
}

interface EditingPosition {
  cellKey: string;
  seenAt: number;
}

export type EditingCellSender = (
  event: string,
  payload: Record<string, unknown>,
  options?: { key?: string },
) => void;

interface UseSchedulePresenceReturn {
  refreshPresence: (options?: { removePresence?: boolean }) => Promise<void>;
  clearPresenceState: () => void;
  endCurrentSession: () => void;
  removeRemoteSession: (editorSessionId: string) => void;
  syncPresence: () => void;
  onlineUsers: OnlineUser[];
  sameAccountSessions: SameAccountEditorSession[];
  isSessionEnded: boolean;
  /** True once presence retries have been exhausted; clears on the next success. */
  isPresenceDegraded: boolean;
  /** Publishes where this editor is. Purely informational: nothing blocks on it. */
  announceEditingCell: (cellKey: string | null) => void;
  /** Applies one `editing_cell` broadcast from a peer. */
  handleEditingCellBroadcast: (payload: unknown) => void;
  /** Which other editor, if any, currently has this cell open. */
  getCellEditor: (cellKey: string) => OnlineUser | null;
}

const PRESENCE_RETRY_BASE_MS = 400;
const PRESENCE_RETRY_MAX_MS = 10_000;
const PRESENCE_RETRY_MAX_ATTEMPTS = 8;

/**
 * Minimum gap between position messages from one editor. The first move after a
 * pause goes out immediately; only someone clicking faster than this is held,
 * and then only until the gap elapses.
 */
export const EDITING_CELL_MIN_INTERVAL_MS = 300;
/**
 * Re-announcement beat. Not the update path: a move is published the moment it
 * happens. This only covers the case the change message cannot, where an editor
 * stops on a cell and the message that would have said so was dropped. Every
 * peer receives every editor's beat, so this trades directly against the
 * per-client events-per-second budget.
 */
export const EDITING_CELL_REANNOUNCE_MS = 5_000;
/** A position nobody has refreshed within this window fades rather than sticking. */
export const EDITING_CELL_STALE_MS = 25_000;

function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(baseMs * 2 ** attempt, maxMs);
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

/**
 * Returning the previous value when nothing meaningful changed keeps referential
 * identity stable, so consumers memoised on these arrays do not re-render on
 * every presence tick.
 */
function preserveIdentity<T>(previous: T | null, next: T, equal: (a: T, b: T) => boolean): T {
  return previous && equal(previous, next) ? previous : next;
}

function onlineUsersEqual(a: OnlineUser[], b: OnlineUser[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((user, index) => {
    const other = b[index];
    return (
      other &&
      other.editorSessionId === user.editorSessionId &&
      other.userId === user.userId &&
      other.userName === user.userName &&
      other.editingCell === user.editingCell &&
      other.canLockCells === user.canLockCells &&
      other.isSameUser === user.isSameUser &&
      other.sessionCount === user.sessionCount
    );
  });
}

function sameAccountSessionsEqual(
  a: SameAccountEditorSession[],
  b: SameAccountEditorSession[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((session, index) => {
    const other = b[index];
    return (
      other &&
      other.editorSessionId === session.editorSessionId &&
      other.editingCell === session.editingCell
    );
  });
}

/** Broadcast payloads arrive from the network, so nothing about them is guaranteed. */
export function parseEditingCellBroadcast(
  payload: unknown,
): { editorSessionId: string; cellKey: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const editorSessionId = value.editorSessionId;
  if (typeof editorSessionId !== "string" || !editorSessionId) return null;
  const cellKey = value.cellKey;
  if (cellKey !== null && (typeof cellKey !== "string" || !cellKey)) return null;
  return { editorSessionId, cellKey: cellKey as string | null };
}

export function useSchedulePresence(
  channelRef: MutableRefObject<RealtimeChannel | null>,
  currentUser: { id: string; name: string } | null,
  editorSessionId: string,
  canTrackPresence = true,
  canLockCells = true,
  sendBroadcast?: EditingCellSender,
): UseSchedulePresenceReturn {
  const [remoteSessions, setRemoteSessions] = useState<Map<string, RemoteEditorSession>>(
    () => new Map(),
  );
  const [positions, setPositions] = useState<Map<string, EditingPosition>>(() => new Map());
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [isPresenceDegraded, setIsPresenceDegraded] = useState(false);

  const sessionEndedRef = useRef(false);
  const currentUserRef = useLatestRef(currentUser);
  const canTrackPresenceRef = useLatestRef(canTrackPresence);
  const canLockCellsRef = useLatestRef(canLockCells);
  const sendBroadcastRef = useLatestRef(sendBroadcast);

  const previousOnlineUsersRef = useRef<OnlineUser[] | null>(null);
  const previousSameAccountSessionsRef = useRef<SameAccountEditorSession[] | null>(null);

  const presenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRetryAttemptRef = useRef(0);
  const presenceFlushInFlightRef = useRef(false);
  const presenceRemovedRef = useRef(false);

  const currentCellRef = useRef<string | null>(null);
  const lastAnnouncedAtRef = useRef(0);
  const pendingAnnounceRef = useRef<{ cellKey: string | null } | null>(null);
  const pendingAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPresenceRetry = useCallback(() => {
    if (!presenceRetryTimerRef.current) return;
    clearTimeout(presenceRetryTimerRef.current);
    presenceRetryTimerRef.current = null;
  }, []);

  const flushPresenceRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Retries slow down but never stop. An earlier version returned without
   * scheduling anything once attempts ran out, and the retry it declined to
   * schedule was the only thing that could have driven the next one, so presence
   * stayed broken for the life of the page.
   */
  const schedulePresenceRetry = useCallback(() => {
    if (presenceRetryTimerRef.current) return;

    const attempt = presenceRetryAttemptRef.current;
    if (attempt >= PRESENCE_RETRY_MAX_ATTEMPTS) {
      setIsPresenceDegraded(true);
    } else {
      presenceRetryAttemptRef.current = attempt + 1;
    }

    const delay =
      attempt >= PRESENCE_RETRY_MAX_ATTEMPTS
        ? PRESENCE_RETRY_MAX_MS
        : backoffDelay(attempt, PRESENCE_RETRY_BASE_MS, PRESENCE_RETRY_MAX_MS);

    presenceRetryTimerRef.current = setTimeout(() => {
      presenceRetryTimerRef.current = null;
      void flushPresenceRef.current();
    }, delay);
  }, []);

  const flushPresence = useCallback(async () => {
    const channel = channelRef.current;
    const user = currentUserRef.current;
    if (!channel || channel.state !== "joined") {
      schedulePresenceRetry();
      return;
    }
    if (presenceFlushInFlightRef.current) return;
    if (!user) return;

    presenceFlushInFlightRef.current = true;
    clearPresenceRetry();

    try {
      const shouldRemove = presenceRemovedRef.current || sessionEndedRef.current;
      const status = shouldRemove
        ? await channel.untrack()
        : await channel.track({
            userId: user.id,
            userName: user.name,
            editorSessionId,
            canLockCells: canLockCellsRef.current,
            isScheduleEditor: canTrackPresenceRef.current,
          } satisfies PresencePayload);

      if (status !== "ok") {
        schedulePresenceRetry();
        return;
      }
    } catch {
      schedulePresenceRetry();
      return;
    } finally {
      presenceFlushInFlightRef.current = false;
    }

    presenceRetryAttemptRef.current = 0;
    setIsPresenceDegraded((degraded) => (degraded ? false : degraded));
  }, [
    canLockCellsRef,
    canTrackPresenceRef,
    channelRef,
    clearPresenceRetry,
    currentUserRef,
    editorSessionId,
    schedulePresenceRetry,
  ]);

  flushPresenceRef.current = flushPresence;

  const refreshPresence = useCallback(
    async (options?: { removePresence?: boolean }) => {
      presenceRemovedRef.current = options?.removePresence === true || sessionEndedRef.current;
      await flushPresence();
    },
    [flushPresence],
  );

  // Identity is stable, so this republishes only when identity or capability
  // actually changes, never when the user moves around the grid.
  useEffect(() => {
    if (!currentUser) return;
    presenceRemovedRef.current = false;
    void flushPresence();
  }, [currentUser, canTrackPresence, canLockCells, flushPresence]);

  useEffect(() => () => clearPresenceRetry(), [clearPresenceRetry]);

  const syncPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState<PresencePayload>();
    const seen = new Map<string, RemoteEditorSession>();

    for (const presences of Object.values(state)) {
      for (const entry of presences as PresencePayload[]) {
        if (!entry.userId || !entry.editorSessionId) continue;
        if (entry.editorSessionId === editorSessionId) continue;
        if (entry.isScheduleEditor === false) continue;

        seen.set(entry.editorSessionId, {
          editorSessionId: entry.editorSessionId,
          userId: entry.userId,
          userName: entry.userName,
          canLockCells: entry.canLockCells !== false,
          isScheduleEditor: true,
        });
      }
    }

    setRemoteSessions((prev) => {
      if (prev.size === seen.size) {
        let identical = true;
        for (const [id, session] of seen) {
          const current = prev.get(id);
          if (
            !current ||
            current.userId !== session.userId ||
            current.userName !== session.userName ||
            current.canLockCells !== session.canLockCells
          ) {
            identical = false;
            break;
          }
        }
        if (identical) return prev;
      }
      return seen;
    });
  }, [channelRef, editorSessionId]);

  const clearPresenceState = useCallback(() => {
    setRemoteSessions(new Map());
    setPositions(new Map());
  }, []);

  const sendPosition = useCallback(
    (cellKey: string | null) => {
      lastAnnouncedAtRef.current = Date.now();
      const send = sendBroadcastRef.current;
      const payload = { editorSessionId, cellKey };
      if (send) {
        // Keyed so a queued position is replaced rather than stacked: only the
        // latest one is worth delivering.
        send("editing_cell", payload, { key: `editing_cell:${editorSessionId}` });
        return;
      }
      const channel = channelRef.current;
      if (!channel || channel.state !== "joined") return;
      void channel.send({ type: "broadcast", event: "editing_cell", payload });
    },
    [channelRef, editorSessionId, sendBroadcastRef],
  );

  const announceEditingCell = useCallback(
    (cellKey: string | null) => {
      currentCellRef.current = cellKey;
      if (sessionEndedRef.current) return;

      const sinceLast = Date.now() - lastAnnouncedAtRef.current;
      if (sinceLast >= EDITING_CELL_MIN_INTERVAL_MS) {
        // Leading edge: the common case pays no delay at all.
        if (pendingAnnounceTimerRef.current) {
          clearTimeout(pendingAnnounceTimerRef.current);
          pendingAnnounceTimerRef.current = null;
          pendingAnnounceRef.current = null;
        }
        sendPosition(cellKey);
        return;
      }

      // Faster than the cap. Hold the newest value and let it out when the gap
      // elapses, so the final position always lands.
      pendingAnnounceRef.current = { cellKey };
      if (pendingAnnounceTimerRef.current) return;
      pendingAnnounceTimerRef.current = setTimeout(() => {
        pendingAnnounceTimerRef.current = null;
        const pending = pendingAnnounceRef.current;
        pendingAnnounceRef.current = null;
        if (pending) sendPosition(pending.cellKey);
      }, EDITING_CELL_MIN_INTERVAL_MS - sinceLast);
    },
    [sendPosition],
  );

  const handleEditingCellBroadcast = useCallback(
    (payload: unknown) => {
      const event = parseEditingCellBroadcast(payload);
      if (!event) return;
      if (event.editorSessionId === editorSessionId) return;

      setPositions((prev) => {
        const next = new Map(prev);
        if (event.cellKey === null) next.delete(event.editorSessionId);
        else next.set(event.editorSessionId, { cellKey: event.cellKey, seenAt: Date.now() });
        return next;
      });
    },
    [editorSessionId],
  );

  // Re-announce while holding a cell, and drop peers who have gone quiet.
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentCellRef.current && !sessionEndedRef.current) {
        sendPosition(currentCellRef.current);
      }
      setPositions((prev) => {
        const cutoff = Date.now() - EDITING_CELL_STALE_MS;
        let changed = false;
        const next = new Map<string, EditingPosition>();
        for (const [id, position] of prev) {
          if (position.seenAt > cutoff) next.set(id, position);
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, EDITING_CELL_REANNOUNCE_MS);
    return () => clearInterval(interval);
  }, [sendPosition]);

  useEffect(
    () => () => {
      if (pendingAnnounceTimerRef.current) clearTimeout(pendingAnnounceTimerRef.current);
    },
    [],
  );

  const endCurrentSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setIsSessionEnded(true);
    currentCellRef.current = null;
    presenceRemovedRef.current = true;
    void flushPresence();
  }, [flushPresence]);

  const removeRemoteSession = useCallback((editorSessionIdToRemove: string) => {
    setRemoteSessions((prev) => {
      if (!prev.has(editorSessionIdToRemove)) return prev;
      const next = new Map(prev);
      next.delete(editorSessionIdToRemove);
      return next;
    });
    setPositions((prev) => {
      if (!prev.has(editorSessionIdToRemove)) return prev;
      const next = new Map(prev);
      next.delete(editorSessionIdToRemove);
      return next;
    });
  }, []);

  const cellBySession = useMemo(() => {
    const map = new Map<string, string>();
    const cutoff = Date.now() - EDITING_CELL_STALE_MS;
    for (const [id, position] of positions) {
      if (position.seenAt > cutoff) map.set(id, position.cellKey);
    }
    return map;
  }, [positions]);

  const onlineUsers = useMemo(() => {
    const currentUserId = currentUser?.id ?? null;
    const grouped = new Map<string, RemoteEditorSession[]>();
    for (const session of remoteSessions.values()) {
      if (!session.isScheduleEditor) continue;
      if (currentUserId != null && session.userId === currentUserId) continue;
      const list = grouped.get(session.userId) ?? [];
      list.push(session);
      grouped.set(session.userId, list);
    }

    const computed: OnlineUser[] = Array.from(grouped.values())
      .map((sessions) => {
        const editing = sessions.find((session) => cellBySession.has(session.editorSessionId));
        const representative = editing ?? sessions[0];
        return {
          editorSessionId: representative.editorSessionId,
          userId: representative.userId,
          userName: representative.userName,
          editingCell: cellBySession.get(representative.editorSessionId) ?? null,
          canLockCells: sessions.some((session) => session.canLockCells),
          isSameUser: false,
          sessionCount: sessions.length,
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));

    const stable = preserveIdentity(previousOnlineUsersRef.current, computed, onlineUsersEqual);
    previousOnlineUsersRef.current = stable;
    return stable;
  }, [remoteSessions, cellBySession, currentUser?.id]);

  const sameAccountSessions = useMemo(() => {
    const currentUserId = currentUser?.id ?? null;
    const computed: SameAccountEditorSession[] = currentUserId
      ? Array.from(remoteSessions.values())
          .filter(
            (session) =>
              session.isScheduleEditor &&
              session.userId === currentUserId &&
              session.editorSessionId !== editorSessionId,
          )
          .map((session) => ({
            editorSessionId: session.editorSessionId,
            editingCell: cellBySession.get(session.editorSessionId) ?? null,
          }))
          .sort((a, b) => a.editorSessionId.localeCompare(b.editorSessionId))
      : [];

    const stable = preserveIdentity(
      previousSameAccountSessionsRef.current,
      computed,
      sameAccountSessionsEqual,
    );
    previousSameAccountSessionsRef.current = stable;
    return stable;
  }, [editorSessionId, remoteSessions, cellBySession, currentUser?.id]);

  const getCellEditor = useCallback(
    (cellKey: string): OnlineUser | null => {
      for (const [sessionId, held] of cellBySession) {
        if (held !== cellKey) continue;
        const session = remoteSessions.get(sessionId);
        if (!session) continue;
        const currentUserId = currentUser?.id ?? null;
        return {
          editorSessionId: session.editorSessionId,
          userId: session.userId,
          userName: session.userName,
          editingCell: cellKey,
          canLockCells: session.canLockCells,
          isSameUser: currentUserId != null && session.userId === currentUserId,
          sessionCount: 1,
        };
      }
      return null;
    },
    [cellBySession, remoteSessions, currentUser?.id],
  );

  return {
    refreshPresence,
    clearPresenceState,
    endCurrentSession,
    removeRemoteSession,
    syncPresence,
    onlineUsers,
    sameAccountSessions,
    isSessionEnded,
    isPresenceDegraded,
    announceEditingCell,
    handleEditingCellBroadcast,
    getCellEditor,
  };
}
