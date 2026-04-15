"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type MutableRefObject,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface CellLock {
  editorSessionId: string;
  userId: string;
  userName: string;
  cellKey: string;
  lockRevision: number;
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
}

interface RemoteEditorSession {
  editorSessionId: string;
  userId: string;
  userName: string;
  editingCell: string | null;
  canLockCells: boolean;
  isScheduleEditor: boolean;
  lockRevision: number;
}

interface UseCellLocksReturn {
  lockCell: (cellKey: string) => void;
  unlockCell: (options?: { removePresence?: boolean }) => void;
  getCellLock: (cellKey: string) => CellLock | null;
  getCellActivity: (cellKey: string) => OnlineUser | null;
  getCurrentCell: () => string | null;
  lockedCells: Map<string, CellLock>;
  onlineUsers: OnlineUser[];
  syncPresence: () => void;
  handleLockBroadcast: (payload: {
    cellKey: string;
    userId: string;
    userName: string;
    editorSessionId: string;
    lockRevision: number;
    canLockCells?: boolean;
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
): UseCellLocksReturn {
  const [remoteSessions, setRemoteSessions] = useState<
    Map<string, RemoteEditorSession>
  >(() => new Map());
  const currentUserRef = useRef(currentUser);
  const canTrackPresenceRef = useRef(canTrackPresence);
  const canLockCellsRef = useRef(canLockCells);
  const currentCellRef = useRef<string | null>(null);
  const lockRevisionRef = useRef(0);
  useEffect(() => {
    currentUserRef.current = currentUser;
    canTrackPresenceRef.current = canTrackPresence;
    canLockCellsRef.current = canLockCells;
  }, [currentUser, canTrackPresence, canLockCells]);

  const trackPresence = useCallback(
    (
      editingCell: string | null,
      lockRevision: number,
      options?: { removePresence?: boolean },
    ) => {
      const channel = channelRef.current;
      const user = currentUserRef.current;
      if (!channel || !user || channel.state !== "joined") return;

      if (options?.removePresence) {
        void channel.untrack();
        return;
      }

      void channel.track({
        editingCell,
        userId: user.id,
        userName: user.name,
        editorSessionId,
        canLockCells: canLockCellsRef.current,
        isScheduleEditor: canTrackPresenceRef.current,
        lockRevision,
      });
    },
    [channelRef, editorSessionId],
  );

  const applyRemoteSessionUpdate = useCallback(
    (
      editorSessionIdToUpdate: string,
      updater: (
        current: RemoteEditorSession | undefined,
      ) => RemoteEditorSession | undefined,
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
    const next = new Map<string, RemoteEditorSession>();

    for (const presences of Object.values(state)) {
      for (const p of presences as PresencePayload[]) {
        if (!p.userId || !p.editorSessionId) continue;
        if (p.editorSessionId === editorSessionId) continue;
        if (p.isScheduleEditor === false) continue;

        const existing = next.get(p.editorSessionId);
        const candidate: RemoteEditorSession = {
          editorSessionId: p.editorSessionId,
          userId: p.userId,
          userName: p.userName,
          editingCell: p.editingCell,
          canLockCells: p.canLockCells === false ? false : true,
          isScheduleEditor: true,
          lockRevision: p.lockRevision ?? 0,
        };
        if (!existing || candidate.lockRevision >= existing.lockRevision) {
          next.set(p.editorSessionId, candidate);
        }
      }
    }

    setRemoteSessions(next);
  }, [channelRef, editorSessionId]);

  const lockCell = useCallback(
    (cellKey: string) => {
      const channel = channelRef.current;
      const user = currentUserRef.current;
      if (!channel || !user) return;
      if (channel.state !== "joined") return;

      const prev = currentCellRef.current;
      if (prev === cellKey) {
        const revision = lockRevisionRef.current;
        trackPresence(cellKey, revision);
        return;
      }

      if (prev) {
        const unlockRevision = ++lockRevisionRef.current;
        if (canLockCellsRef.current) {
          channel.send({
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
        trackPresence(null, unlockRevision);
      }

      currentCellRef.current = cellKey;
      const lockRevision = ++lockRevisionRef.current;

      trackPresence(cellKey, lockRevision);
      if (canLockCellsRef.current) {
        channel.send({
          type: "broadcast",
          event: "cell_locked",
          payload: {
            cellKey,
            userId: user.id,
            userName: user.name,
            editorSessionId,
            lockRevision,
            canLockCells: canLockCellsRef.current,
          },
        });
      }
    },
    [channelRef, editorSessionId, trackPresence],
  );

  const unlockCell = useCallback((options?: { removePresence?: boolean }) => {
    const channel = channelRef.current;
    const user = currentUserRef.current;
    const prev = currentCellRef.current;

    currentCellRef.current = null;
    const lockRevision = ++lockRevisionRef.current;

    if (!channel || !user) return;
    if (channel.state !== "joined") return;

    trackPresence(null, lockRevision, options);
    if (!prev) return;
    if (!canLockCellsRef.current) return;

    channel.send({
      type: "broadcast",
      event: "cell_unlocked",
      payload: {
        userId: user.id,
        editorSessionId,
        cellKey: prev,
        lockRevision,
      },
    });
  }, [channelRef, editorSessionId, trackPresence]);

  const handleLockBroadcast = useCallback(
    (payload: {
      cellKey: string;
      userId: string;
      userName: string;
      editorSessionId: string;
      lockRevision: number;
      canLockCells?: boolean;
    }) => {
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
      const list = grouped.get(session.userId) ?? [];
      list.push(session);
      grouped.set(session.userId, list);
    }

    return Array.from(grouped.values())
      .map((sessions) => {
        const sorted = [...sessions].sort((a, b) => b.lockRevision - a.lockRevision);
        const latest = sorted[0];
        const editingSession =
          sorted.find((session) => session.editingCell) ?? latest;
        return {
          editorSessionId: editingSession.editorSessionId,
          userId: latest.userId,
          userName: latest.userName,
          editingCell: editingSession.editingCell,
          canLockCells: sorted.some((session) => session.canLockCells),
          isSameUser: currentUserId != null && latest.userId === currentUserId,
          sessionCount: sessions.length,
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));
  }, [remoteSessions, currentUser?.id]);

  const lockedCells = useMemo(() => {
    const currentUserId = currentUser?.id ?? null;
    const next = new Map<string, CellLock>();
    for (const session of remoteSessions.values()) {
      if (!session.editingCell || !session.canLockCells) continue;
      if (currentUserId != null && session.userId === currentUserId) continue;
      const existing = next.get(session.editingCell);
      if (!existing || session.lockRevision >= existing.lockRevision) {
        next.set(session.editingCell, {
          editorSessionId: session.editorSessionId,
          userId: session.userId,
          userName: session.userName,
          cellKey: session.editingCell,
          lockRevision: session.lockRevision,
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
    getCellLock,
    getCellActivity,
    getCurrentCell,
    lockedCells,
    onlineUsers,
    syncPresence,
    handleLockBroadcast,
    handleUnlockBroadcast,
  };
}
