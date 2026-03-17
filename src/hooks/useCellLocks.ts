"use client";

import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface CellLock {
  userId: string;
  userName: string;
  cellKey: string;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  editingCell: string | null;
}

interface PresencePayload {
  editingCell: string | null;
  userId: string;
  userName: string;
}

interface UseCellLocksReturn {
  lockCell: (cellKey: string) => void;
  unlockCell: () => void;
  getCellLock: (cellKey: string) => CellLock | null;
  lockedCells: Map<string, CellLock>;
  onlineUsers: OnlineUser[];
  syncPresence: () => void;
}

export function useCellLocks(
  channelRef: MutableRefObject<RealtimeChannel | null>,
  currentUser: { id: string; name: string } | null,
): UseCellLocksReturn {
  const [lockedCells, setLockedCells] = useState<Map<string, CellLock>>(
    () => new Map(),
  );
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Rebuild lockedCells map + onlineUsers list from presence state.
  // Returned so the parent can register it directly on the channel —
  // this ensures the handler is always on the active channel, even
  // after channel recreation (which orphaned the old useEffect approach).
  const syncPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState<PresencePayload>();
    const next = new Map<string, CellLock>();
    const users: OnlineUser[] = [];
    const seenUserIds = new Set<string>();

    for (const presences of Object.values(state)) {
      for (const p of presences as PresencePayload[]) {
        if (!p.userId) continue;

        // Build online users list (deduplicated, excluding current user)
        if (
          !seenUserIds.has(p.userId) &&
          currentUserRef.current &&
          p.userId !== currentUserRef.current.id
        ) {
          seenUserIds.add(p.userId);
          users.push({
            userId: p.userId,
            userName: p.userName,
            editingCell: p.editingCell,
          });
        }

        // Build cell locks map (only cells being edited by others)
        if (
          p.editingCell &&
          currentUserRef.current &&
          p.userId !== currentUserRef.current.id
        ) {
          next.set(p.editingCell, {
            userId: p.userId,
            userName: p.userName,
            cellKey: p.editingCell,
          });
        }
      }
    }

    setLockedCells(next);
    setOnlineUsers(users);
  }, [channelRef]);

  const lockCell = useCallback(
    (cellKey: string) => {
      const channel = channelRef.current;
      const user = currentUserRef.current;
      if (!channel || !user) return;
      void channel.track({
        editingCell: cellKey,
        userId: user.id,
        userName: user.name,
      });
    },
    [channelRef],
  );

  const unlockCell = useCallback(() => {
    const channel = channelRef.current;
    const user = currentUserRef.current;
    if (!channel || !user) return;
    void channel.track({
      editingCell: null,
      userId: user.id,
      userName: user.name,
    });
  }, [channelRef]);

  const getCellLock = useCallback(
    (cellKey: string): CellLock | null => {
      return lockedCells.get(cellKey) ?? null;
    },
    [lockedCells],
  );

  return { lockCell, unlockCell, getCellLock, lockedCells, onlineUsers, syncPresence };
}
