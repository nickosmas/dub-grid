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
  isSessionEnded: boolean;
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
  const removedRemoteSessionIdsRef = useRef(new Set<string>());
  const currentUserRef = useLatestRef(currentUser);
  const canTrackPresenceRef = useLatestRef(canTrackPresence);
  const canLockCellsRef = useLatestRef(canLockCells);
  const currentCellRef = useRef<string | null>(null);
  const currentSeriesIdRef = useRef<string | null>(null);
  const lockRevisionRef = useRef(0);
  const desiredPresenceRef = useRef<LocalPresenceState>({
    editingCell: null,
    lockRevision: 0,
    removePresence: false,
    editingSeriesId: null,
  });
  const presenceVersionRef = useRef(0);
  const presenceFlushInFlightRef = useRef(false);
  const presenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellStateBroadcastKey = `cell_state:${editorSessionId}`;

  const clearPresenceRetry = useCallback(() => {
    if (!presenceRetryTimerRef.current) return;
    clearTimeout(presenceRetryTimerRef.current);
    presenceRetryTimerRef.current = null;
  }, []);

  const flushPresence = useCallback(async () => {
    const channel = channelRef.current;
    const user = currentUserRef.current;
    if (!channel || channel.state !== "joined") return;
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
        if (!presenceRetryTimerRef.current) {
          presenceRetryTimerRef.current = setTimeout(() => {
            presenceRetryTimerRef.current = null;
            void flushPresence();
          }, 400);
        }
        return;
      }
    } catch {
      if (!presenceRetryTimerRef.current) {
        presenceRetryTimerRef.current = setTimeout(() => {
          presenceRetryTimerRef.current = null;
          void flushPresence();
        }, 400);
      }
      return;
    } finally {
      presenceFlushInFlightRef.current = false;
    }

    if (presenceVersionRef.current !== version) {
      await flushPresence();
    }
  }, [channelRef, clearPresenceRetry, editorSessionId]);

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
      removedRemoteSessionIdsRef.current.add(editorSessionIdToRemove);
      applyRemoteSessionUpdate(editorSessionIdToRemove, () => undefined);
    },
    [applyRemoteSessionUpdate],
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
        const unlockRevision = ++lockRevisionRef.current;
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
      const lockRevision = ++lockRevisionRef.current;

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

      currentCellRef.current = null;
      currentSeriesIdRef.current = null;
      const lockRevision = ++lockRevisionRef.current;

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
        if (!current) return current;
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

    return Array.from(grouped.values())
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
  }, [remoteSessions, currentUser?.id]);

  const lockedCells = useMemo(() => {
    const currentUserId = currentUser?.id ?? null;
    const next = new Map<string, CellLock>();
    for (const session of remoteSessions.values()) {
      if (!session.editingCell) continue;
      const existing = next.get(session.editingCell);
      if (!existing || session.lockRevision >= existing.lockRevision) {
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
    return next;
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
    isSessionEnded,
    syncPresence,
    handleLockBroadcast,
    handleUnlockBroadcast,
  };
}
