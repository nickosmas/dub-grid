"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type MutableRefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface CellLock {
  editorSessionId: string;
  userId: string;
  userName: string;
  cellKey: string;
  lockRevision: number;
  owner: "same_account" | "other_account";
  seriesId: string | null;
}

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

interface PresencePayload {
  editingCell: string | null;
  userId: string;
  userName: string;
  editorSessionId: string;
  canLockCells?: boolean;
  isScheduleEditor?: boolean;
  lockRevision?: number;
  editingSeriesId?: string | null;
}

interface RemoteEditorSession {
  editorSessionId: string;
  userId: string;
  userName: string;
  editingCell: string | null;
  canLockCells: boolean;
  isScheduleEditor: boolean;
  lockRevision: number;
  editingSeriesId: string | null;
}

interface LocalPresenceState {
  editingCell: string | null;
  lockRevision: number;
  removePresence: boolean;
  editingSeriesId: string | null;
}

function remoteSessionsEqual(
  current: RemoteEditorSession | undefined,
  next: RemoteEditorSession | undefined,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;

  return (
    current.editorSessionId === next.editorSessionId &&
    current.userId === next.userId &&
    current.userName === next.userName &&
    current.editingCell === next.editingCell &&
    current.canLockCells === next.canLockCells &&
    current.isScheduleEditor === next.isScheduleEditor &&
    current.lockRevision === next.lockRevision &&
    current.editingSeriesId === next.editingSeriesId
  );
}

interface BroadcastSender {
  (event: string, payload: Record<string, unknown>, options?: { key?: string }): void;
}

interface UseCellLocksReturn {
  lockCell: (cellKey: string, options?: { seriesId?: string | null }) => void;
  unlockCell: (options?: { removePresence?: boolean }) => void;
  refreshPresence: (options?: { removePresence?: boolean }) => Promise<void>;
  clearPresenceState: () => void;
  endCurrentSession: () => void;
  removeRemoteSession: (editorSessionId: string) => void;
  getCellLock: (cellKey: string) => CellLock | null;
  getCellActivity: (cellKey: string) => OnlineUser | null;
  getCurrentCell: () => string | null;
  lockedCells: Map<string, CellLock>;
  onlineUsers: OnlineUser[];
  sameAccountSessions: SameAccountEditorSession[];
  isSessionEnded: boolean;
  /** True once presence retries have been exhausted; clears on the next success. */
  isPresenceDegraded: boolean;
  syncPresence: () => void;
  handleLockBroadcast: (payload: {
    cellKey: string;
    userId: string;
    userName: string;
    editorSessionId: string;
    lockRevision: number;
    canLockCells?: boolean;
    seriesId?: string | null;
  }) => void;
  handleUnlockBroadcast: (payload: {
    userId: string;
    editorSessionId: string;
    cellKey: string | null;
    lockRevision: number;
  }) => void;
}

/**
 * Lock revisions, issued monotonically for the whole tab.
 *
 * Peers reject any lock or presence update whose revision is below the one they
 * already hold for that editor session id, and that id outlives a single mount.
 * A per-mount counter therefore restarted below what peers had already seen and
 * their updates were silently ignored. Seeding from the clock is not enough on
 * its own: a remount in the same millisecond starts at a value the previous
 * mount had already incremented past, which is exactly what Strict Mode does.
 */
let lastIssuedLockRevision = Date.now();

/** Upper bound on remembered force-ended sessions; see `rememberRemovedSession`. */
const MAX_REMEMBERED_REMOVED_SESSIONS = 200;

/**
 * Presence retry schedule.
 *
 * A flat retry never escalated and never gave up, so a sustained outage meant
 * retrying forever with nothing shown to the user, and every pending timer fired
 * at once when a sleeping machine woke. Backoff spreads that out, the cap keeps
 * it responsive, and jitter stops many editors retrying in lockstep after a
 * shared outage.
 */
const PRESENCE_RETRY_BASE_MS = 400;
const PRESENCE_RETRY_MAX_MS = 10_000;
const PRESENCE_RETRY_MAX_ATTEMPTS = 8;

function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(baseMs * 2 ** attempt, maxMs);
  return exponential / 2 + Math.random() * (exponential / 2);
}

/**
 * Returns the previous value when the freshly computed one is equivalent.
 *
 * `lockedCells` and `onlineUsers` feed `memo`-wrapped grid sections. Rebuilding
 * them on every presence event handed those sections a new object identity even
 * when nothing they render had changed, which defeated the memo and re-rendered
 * the whole schedule. With ten editors moving around that is continuous.
 */
function preserveIdentity<T>(previous: T | null, next: T, equal: (a: T, b: T) => boolean): T {
  return previous !== null && equal(previous, next) ? previous : next;
}

function cellLocksEqual(a: Map<string, CellLock>, b: Map<string, CellLock>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, lock] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (
      lock.editorSessionId !== other.editorSessionId ||
      lock.userId !== other.userId ||
      lock.userName !== other.userName ||
      lock.cellKey !== other.cellKey ||
      lock.lockRevision !== other.lockRevision ||
      lock.owner !== other.owner ||
      lock.seriesId !== other.seriesId
    ) {
      return false;
    }
  }
  return true;
}

function onlineUsersEqual(a: OnlineUser[], b: OnlineUser[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((user, index) => {
    const other = b[index];
    return (
      user.editorSessionId === other.editorSessionId &&
      user.userId === other.userId &&
      user.userName === other.userName &&
      user.editingCell === other.editingCell &&
      user.canLockCells === other.canLockCells &&
      user.isSameUser === other.isSameUser &&
      user.sessionCount === other.sessionCount
    );
  });
}

function sameAccountSessionsEqual(
  a: SameAccountEditorSession[],
  b: SameAccountEditorSession[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every(
    (session, index) =>
      session.editorSessionId === b[index].editorSessionId &&
      session.editingCell === b[index].editingCell,
  );
}

function nextLockRevision(): number {
  lastIssuedLockRevision = Math.max(lastIssuedLockRevision + 1, Date.now());
  return lastIssuedLockRevision;
}

export function useCellLocks(
  channelRef: MutableRefObject<RealtimeChannel | null>,
  currentUser: { id: string; name: string } | null,
  editorSessionId: string,
  canTrackPresence = true,
  canLockCells = true,
  sendBroadcast?: BroadcastSender,
): UseCellLocksReturn {
  const [remoteSessions, setRemoteSessions] = useState<Map<string, RemoteEditorSession>>(
    () => new Map(),
  );
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const sessionEndedRef = useRef(false);
  /**
   * Force-ended sessions, kept so an ended editor cannot reappear from a stale
   * presence snapshot. Bounded because a long-lived page would otherwise grow
   * it without limit; an editor that legitimately returns does so under a fresh
   * session id, so dropping the oldest entries is safe.
   */
  const removedRemoteSessionIdsRef = useRef(new Set<string>());
  const rememberRemovedSession = useCallback((sessionId: string) => {
    const removed = removedRemoteSessionIdsRef.current;
    removed.add(sessionId);
    while (removed.size > MAX_REMEMBERED_REMOVED_SESSIONS) {
      const oldest = removed.values().next().value;
      if (oldest === undefined) break;
      removed.delete(oldest);
    }
  }, []);
  const currentUserRef = useLatestRef(currentUser);
  const canTrackPresenceRef = useLatestRef(canTrackPresence);
  const canLockCellsRef = useLatestRef(canLockCells);
  const currentCellRef = useRef<string | null>(null);
  const currentSeriesIdRef = useRef<string | null>(null);
  /** Last revision this session issued; see `nextLockRevision`. */
  const lockRevisionRef = useRef(lastIssuedLockRevision);
  const desiredPresenceRef = useRef<LocalPresenceState>({
    editingCell: null,
    lockRevision: 0,
    removePresence: false,
    editingSeriesId: null,
  });
  const previousOnlineUsersRef = useRef<OnlineUser[] | null>(null);
  const previousSameAccountSessionsRef = useRef<SameAccountEditorSession[] | null>(null);
  const previousLockedCellsRef = useRef<Map<string, CellLock> | null>(null);
  const presenceVersionRef = useRef(0);
  const presenceFlushInFlightRef = useRef(false);
  const presenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRetryAttemptRef = useRef(0);
  const [isPresenceDegraded, setIsPresenceDegraded] = useState(false);
  const cellStateBroadcastKey = `cell_state:${editorSessionId}`;

  const clearPresenceRetry = useCallback(() => {
    if (!presenceRetryTimerRef.current) return;
    clearTimeout(presenceRetryTimerRef.current);
    presenceRetryTimerRef.current = null;
  }, []);

  // Retries reach the current flush through a ref, so the scheduler does not
  // have to be recreated whenever the flush closure changes. Declared ahead of
  // its only consumer so it can never be read before initialisation.
  const flushPresenceRef = useRef<() => Promise<void>>(async () => {});

  const schedulePresenceRetry = useCallback(() => {
    if (presenceRetryTimerRef.current) return;
    if (presenceRetryAttemptRef.current >= PRESENCE_RETRY_MAX_ATTEMPTS) {
      // Out of attempts. Surface it rather than retrying silently forever; the
      // next successful flush clears the flag.
      setIsPresenceDegraded(true);
      return;
    }
    const delay = backoffDelay(
      presenceRetryAttemptRef.current,
      PRESENCE_RETRY_BASE_MS,
      PRESENCE_RETRY_MAX_MS,
    );
    presenceRetryAttemptRef.current += 1;
    presenceRetryTimerRef.current = setTimeout(() => {
      presenceRetryTimerRef.current = null;
      void flushPresenceRef.current();
    }, delay);
  }, []);

  const flushPresence = useCallback(async () => {
    const channel = channelRef.current;
    const user = currentUserRef.current;
    if (!channel || channel.state !== "joined") {
      // The desired state is still pending. Retry rather than dropping it: the
      // channel may be mid-reconnect, and nothing else is guaranteed to flush.
      schedulePresenceRetry();
      return;
    }
    if (presenceFlushInFlightRef.current) return;

    presenceFlushInFlightRef.current = true;
    clearPresenceRetry();

    const version = presenceVersionRef.current;
    const desiredPresence = desiredPresenceRef.current;

    try {
      const status =
        desiredPresence.removePresence || sessionEndedRef.current
          ? await channel.untrack()
          : user
            ? await channel.track({
                editingCell: desiredPresence.editingCell,
                userId: user.id,
                userName: user.name,
                editorSessionId,
                canLockCells: canLockCellsRef.current,
                isScheduleEditor: canTrackPresenceRef.current,
                lockRevision: desiredPresence.lockRevision,
                editingSeriesId: desiredPresence.editingSeriesId,
              })
            : null;

      if (!status) {
        return;
      }

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

    if (presenceVersionRef.current !== version) {
      await flushPresence();
    }
  }, [channelRef, clearPresenceRetry, editorSessionId, schedulePresenceRetry]);

  flushPresenceRef.current = flushPresence;

  const queuePresence = useCallback(
    (
      editingCell: string | null,
      lockRevision: number,
      options?: { removePresence?: boolean; seriesId?: string | null },
    ) => {
      desiredPresenceRef.current = {
        editingCell: sessionEndedRef.current ? null : editingCell,
        lockRevision,
        removePresence: sessionEndedRef.current || options?.removePresence === true,
        editingSeriesId: sessionEndedRef.current ? null : (options?.seriesId ?? null),
      };
      presenceVersionRef.current += 1;
      void flushPresence();
    },
    [flushPresence],
  );

  const refreshPresence = useCallback(
    async (options?: { removePresence?: boolean }) => {
      desiredPresenceRef.current = {
        editingCell:
          sessionEndedRef.current || options?.removePresence ? null : currentCellRef.current,
        lockRevision: lockRevisionRef.current,
        removePresence: sessionEndedRef.current || options?.removePresence === true,
        editingSeriesId:
          sessionEndedRef.current || options?.removePresence ? null : currentSeriesIdRef.current,
      };
      presenceVersionRef.current += 1;
      await flushPresence();
    },
    [flushPresence],
  );

  useEffect(() => {
    return () => {
      clearPresenceRetry();
    };
  }, [clearPresenceRetry]);

  const applyRemoteSessionUpdate = useCallback(
    (
      editorSessionIdToUpdate: string,
      updater: (current: RemoteEditorSession | undefined) => RemoteEditorSession | undefined,
    ) => {
      if (editorSessionIdToUpdate === editorSessionId) return;
      setRemoteSessions((prev) => {
        const current = prev.get(editorSessionIdToUpdate);
        const nextValue = updater(current);
        if (nextValue === current) return prev;
        const next = new Map(prev);
        if (nextValue) next.set(editorSessionIdToUpdate, nextValue);
        else next.delete(editorSessionIdToUpdate);
        return next;
      });
    },
    [editorSessionId],
  );

  const syncPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState<PresencePayload>();
    const presenceSessions = new Map<string, RemoteEditorSession>();

    for (const presences of Object.values(state)) {
      for (const p of presences as PresencePayload[]) {
        if (!p.userId || !p.editorSessionId) continue;
        if (p.editorSessionId === editorSessionId) continue;
        if (removedRemoteSessionIdsRef.current.has(p.editorSessionId)) continue;
        if (p.isScheduleEditor === false) continue;

        const existing = presenceSessions.get(p.editorSessionId);
        const candidate: RemoteEditorSession = {
          editorSessionId: p.editorSessionId,
          userId: p.userId,
          userName: p.userName,
          editingCell: p.editingCell,
          canLockCells: p.canLockCells === false ? false : true,
          isScheduleEditor: true,
          lockRevision: p.lockRevision ?? 0,
          editingSeriesId: p.editingSeriesId ?? null,
        };
        if (!existing || candidate.lockRevision >= existing.lockRevision) {
          presenceSessions.set(p.editorSessionId, candidate);
        }
      }
    }

    setRemoteSessions((prev) => {
      let changed = prev.size !== presenceSessions.size;
      const next = new Map<string, RemoteEditorSession>();

      for (const [sessionId, presenceSession] of presenceSessions) {
        const current = prev.get(sessionId);
        // A newer local revision from a broadcast still wins over a stale
        // presence snapshot, so a just-taken lock is not rolled back.
        const nextSession =
          current && current.lockRevision > presenceSession.lockRevision
            ? current
            : presenceSession;

        next.set(sessionId, nextSession);

        if (!changed && !remoteSessionsEqual(current, nextSession)) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [channelRef, editorSessionId]);

  const clearPresenceState = useCallback(() => {
    setRemoteSessions(new Map());
  }, []);

  const removeRemoteSession = useCallback(
    (editorSessionIdToRemove: string) => {
      rememberRemovedSession(editorSessionIdToRemove);
      applyRemoteSessionUpdate(editorSessionIdToRemove, () => undefined);
    },
    [applyRemoteSessionUpdate, rememberRemovedSession],
  );

  const lockCell = useCallback(
    (cellKey: string, options?: { seriesId?: string | null }) => {
      if (sessionEndedRef.current) return;
      const channel = channelRef.current;
      const user = currentUserRef.current;
      if (!user) return;

      const prev = currentCellRef.current;
      const nextSeriesId = options?.seriesId ?? null;
      if (prev === cellKey) {
        const revision = lockRevisionRef.current;
        currentSeriesIdRef.current = nextSeriesId;
        queuePresence(cellKey, revision, { seriesId: nextSeriesId });
        return;
      }

      if (prev) {
        const unlockRevision = (lockRevisionRef.current = nextLockRevision());
        if (canLockCellsRef.current) {
          if (sendBroadcast) {
            sendBroadcast(
              "cell_unlocked",
              {
                userId: user.id,
                editorSessionId,
                cellKey: prev,
                lockRevision: unlockRevision,
              },
              { key: cellStateBroadcastKey },
            );
          } else {
            if (channel && channel.state === "joined") {
              void channel.send({
                type: "broadcast",
                event: "cell_unlocked",
                payload: {
                  userId: user.id,
                  editorSessionId,
                  cellKey: prev,
                  lockRevision: unlockRevision,
                },
              });
            }
          }
        }
        queuePresence(null, unlockRevision);
      }

      currentCellRef.current = cellKey;
      currentSeriesIdRef.current = nextSeriesId;
      const lockRevision = (lockRevisionRef.current = nextLockRevision());

      queuePresence(cellKey, lockRevision, { seriesId: nextSeriesId });
      if (canLockCellsRef.current) {
        if (sendBroadcast) {
          sendBroadcast(
            "cell_locked",
            {
              cellKey,
              userId: user.id,
              userName: user.name,
              editorSessionId,
              lockRevision,
              canLockCells: canLockCellsRef.current,
              seriesId: nextSeriesId,
            },
            { key: cellStateBroadcastKey },
          );
        } else {
          if (channel && channel.state === "joined") {
            void channel.send({
              type: "broadcast",
              event: "cell_locked",
              payload: {
                cellKey,
                userId: user.id,
                userName: user.name,
                editorSessionId,
                lockRevision,
                canLockCells: canLockCellsRef.current,
                seriesId: nextSeriesId,
              },
            });
          }
        }
      }
    },
    [channelRef, cellStateBroadcastKey, editorSessionId, queuePresence, sendBroadcast],
  );

  const unlockCell = useCallback(
    (options?: { removePresence?: boolean }) => {
      const channel = channelRef.current;
      const user = currentUserRef.current;
      const prev = currentCellRef.current;
      // Releasing nothing is a no-op unless presence is being removed. This runs
      // on every tab hide, and re-tracking there was pure presence churn.
      if (!prev && !options?.removePresence) return;

      currentCellRef.current = null;
      currentSeriesIdRef.current = null;
      const lockRevision = (lockRevisionRef.current = nextLockRevision());

      queuePresence(null, lockRevision, options);

      if (!user) return;
      if (!prev) return;
      if (!canLockCellsRef.current) return;

      if (sendBroadcast) {
        sendBroadcast(
          "cell_unlocked",
          {
            userId: user.id,
            editorSessionId,
            cellKey: prev,
            lockRevision,
          },
          { key: cellStateBroadcastKey },
        );
        return;
      }

      if (!channel || channel.state !== "joined") return;

      void channel.send({
        type: "broadcast",
        event: "cell_unlocked",
        payload: {
          userId: user.id,
          editorSessionId,
          cellKey: prev,
          lockRevision,
        },
      });
    },
    [channelRef, cellStateBroadcastKey, editorSessionId, queuePresence, sendBroadcast],
  );

  const endCurrentSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setIsSessionEnded(true);
    unlockCell({ removePresence: true });
  }, [unlockCell]);

  const handleLockBroadcast = useCallback(
    (payload: {
      cellKey: string;
      userId: string;
      userName: string;
      editorSessionId: string;
      lockRevision: number;
      canLockCells?: boolean;
      seriesId?: string | null;
    }) => {
      if (removedRemoteSessionIdsRef.current.has(payload.editorSessionId)) return;
      applyRemoteSessionUpdate(payload.editorSessionId, (current) => {
        if (current && payload.lockRevision < current.lockRevision) {
          return current;
        }
        return {
          editorSessionId: payload.editorSessionId,
          userId: payload.userId,
          userName: payload.userName,
          editingCell: payload.cellKey,
          canLockCells: payload.canLockCells !== false,
          isScheduleEditor: true,
          lockRevision: payload.lockRevision,
          editingSeriesId: payload.seriesId ?? null,
        };
      });
    },
    [applyRemoteSessionUpdate],
  );

  const handleUnlockBroadcast = useCallback(
    (payload: {
      userId: string;
      editorSessionId: string;
      cellKey: string | null;
      lockRevision: number;
    }) => {
      applyRemoteSessionUpdate(payload.editorSessionId, (current) => {
        if (!current) {
          // The release can arrive before we have ever seen this session, e.g.
          // when mounting while someone is closing a cell. Dropping it let the
          // next presence snapshot, which still advertises the old cell, put the
          // lock back on a cell nobody holds. Record the release instead, marked
          // so it contributes no avatar until real presence data arrives.
          return {
            editorSessionId: payload.editorSessionId,
            userId: payload.userId,
            userName: "",
            editingCell: null,
            canLockCells: true,
            isScheduleEditor: false,
            lockRevision: payload.lockRevision,
            editingSeriesId: null,
          };
        }
        if (payload.lockRevision < current.lockRevision) return current;
        if (payload.cellKey && current.editingCell !== payload.cellKey) {
          return current;
        }
        return {
          ...current,
          editingCell: null,
          lockRevision: payload.lockRevision,
          editingSeriesId: null,
        };
      });
    },
    [applyRemoteSessionUpdate],
  );

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
        const sorted = [...sessions].sort((a, b) => b.lockRevision - a.lockRevision);
        const latest = sorted[0];
        const editingSession = sorted.find((session) => session.editingCell) ?? latest;
        return {
          editorSessionId: editingSession.editorSessionId,
          userId: latest.userId,
          userName: latest.userName,
          editingCell: editingSession.editingCell,
          canLockCells: sorted.some((session) => session.canLockCells),
          isSameUser: false,
          sessionCount: sessions.length,
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));

    const stable = preserveIdentity(previousOnlineUsersRef.current, computed, onlineUsersEqual);
    previousOnlineUsersRef.current = stable;
    return stable;
  }, [remoteSessions, currentUser?.id]);

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
            editingCell: session.editingCell,
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
  }, [editorSessionId, remoteSessions, currentUser?.id]);

  const lockedCells = useMemo(() => {
    const currentUserId = currentUser?.id ?? null;
    const next = new Map<string, CellLock>();
    for (const session of remoteSessions.values()) {
      if (!session.editingCell) continue;
      const existing = next.get(session.editingCell);
      // Revisions are clock-derived, so the newer lock wins. Clocks differ
      // slightly between machines, so ties break on the session id: an
      // arbitrary rule is fine, but every client must reach the same answer or
      // they would disagree about who holds a cell.
      const wins =
        !existing ||
        session.lockRevision > existing.lockRevision ||
        (session.lockRevision === existing.lockRevision &&
          session.editorSessionId > existing.editorSessionId);
      if (wins) {
        next.set(session.editingCell, {
          editorSessionId: session.editorSessionId,
          userId: session.userId,
          userName: session.userName,
          cellKey: session.editingCell,
          lockRevision: session.lockRevision,
          owner:
            currentUserId != null && session.userId === currentUserId
              ? "same_account"
              : "other_account",
          seriesId: session.editingSeriesId,
        });
      }
    }
    const stable = preserveIdentity(previousLockedCellsRef.current, next, cellLocksEqual);
    previousLockedCellsRef.current = stable;
    return stable;
  }, [remoteSessions, currentUser?.id]);

  const getCellLock = useCallback(
    (cellKey: string): CellLock | null => {
      return lockedCells.get(cellKey) ?? null;
    },
    [lockedCells],
  );

  const getCellActivity = useCallback(
    (cellKey: string): OnlineUser | null => {
      const currentUserId = currentUser?.id ?? null;
      const sessions = Array.from(remoteSessions.values())
        .filter((session) => session.editingCell === cellKey)
        .sort((a, b) => b.lockRevision - a.lockRevision);
      const match = sessions[0];
      if (!match) return null;
      return {
        editorSessionId: match.editorSessionId,
        userId: match.userId,
        userName: match.userName,
        editingCell: match.editingCell,
        canLockCells: match.canLockCells,
        isSameUser: currentUserId != null && match.userId === currentUserId,
        sessionCount: sessions.length,
      };
    },
    [remoteSessions, currentUser?.id],
  );

  const getCurrentCell = useCallback((): string | null => {
    return currentCellRef.current;
  }, []);

  return {
    lockCell,
    unlockCell,
    refreshPresence,
    clearPresenceState,
    endCurrentSession,
    removeRemoteSession,
    getCellLock,
    getCellActivity,
    getCurrentCell,
    lockedCells,
    onlineUsers,
    sameAccountSessions,
    isSessionEnded,
    isPresenceDegraded,
    syncPresence,
    handleLockBroadcast,
    handleUnlockBroadcast,
  };
}
