import type { Session, User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TabCoordinatorOptions {
  /** localStorage key for the lock (default: "sg_refresh_lock") */
  lockKey?: string;
  /** Lock TTL in ms (default: 10_000) */
  lockTtlMs?: number;
  /** BroadcastChannel name (default: "sg_auth_sync") */
  channelName?: string;
  /** Seconds before expiry to consider a session near-expiry (default: 60) */
  nearExpiryThresholdSec?: number;
  /** ms to wait for a broadcast before fallback refresh (default: 15_000) */
  broadcastTimeoutMs?: number;
}

export interface RefreshLock {
  tabId: string;
  acquiredAt: number;
}

export interface SerializableSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: "bearer";
  user: User;
}

export type SyncMessage =
  | { type: "SESSION_REFRESHED"; session: SerializableSession }
  | { type: "SIGNED_OUT" };

export interface TabCoordinator {
  /** Try to acquire the refresh lock. Returns true if this tab is now the leader. */
  acquireLock(): boolean;
  /** Release the lock unconditionally. */
  releaseLock(): void;
  /** Returns true if the lock is currently held by this tab. */
  isLeader(): boolean;
  /** Broadcast a message to all other tabs. No-op if BroadcastChannel unavailable. */
  broadcast(message: SyncMessage): void;
  /** Register a callback for incoming sync messages from other tabs. Returns an unsubscribe fn. */
  onMessage(handler: (message: SyncMessage) => void): () => void;
  /** Returns true if the given session token expires within `nearExpiryThresholdSec`. */
  isNearExpiry(session: Session | null): boolean;
  /** Clean up: close channel, remove listeners. */
  destroy(): void;
}

// ── Session serialisation helpers ─────────────────────────────────────────────

/**
 * Extracts only the serialisable fields from a Supabase Session for broadcast
 * over BroadcastChannel (Requirements 2.1, 2.2).
 */
export function serializeSession(session: Session): SerializableSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at as number,
    token_type: session.token_type,
    user: session.user,
  };
}

/**
 * Reconstructs a Session-compatible object from a serialised broadcast payload.
 * The result can be passed directly to `supabase.auth.setSession()`.
 */
export function deserializeSession(raw: SerializableSession): Session {
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at,
    token_type: raw.token_type,
    user: raw.user,
    // expires_in is derived from expires_at for compatibility
    expires_in: Math.max(0, raw.expires_at - Math.floor(Date.now() / 1000)),
  };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_LOCK_KEY = "sg_refresh_lock";
const DEFAULT_LOCK_TTL_MS = 10_000;
const DEFAULT_CHANNEL_NAME = "sg_auth_sync";
const DEFAULT_NEAR_EXPIRY_THRESHOLD_SEC = 60;
const DEFAULT_BROADCAST_TIMEOUT_MS = 15_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto.randomUUID
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTabCoordinator(options?: TabCoordinatorOptions): TabCoordinator {
  const lockKey = options?.lockKey ?? DEFAULT_LOCK_KEY;
  const lockTtlMs = options?.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const channelName = options?.channelName ?? DEFAULT_CHANNEL_NAME;
  const nearExpiryThresholdSec =
    options?.nearExpiryThresholdSec ?? DEFAULT_NEAR_EXPIRY_THRESHOLD_SEC;

  const tabId = generateTabId();

  // ── BroadcastChannel setup ─────────────────────────────────────────────────

  let channel: BroadcastChannel | null = null;
  const messageHandlers = new Set<(message: SyncMessage) => void>();

  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent) => {
        const msg = event.data as SyncMessage;
        for (const handler of messageHandlers) {
          try {
            handler(msg);
          } catch {
            // Swallow handler errors to avoid breaking other handlers
          }
        }
      };
    }
  } catch {
    channel = null;
  }

  // ── localStorage helpers ───────────────────────────────────────────────────

  function readLock(): RefreshLock | null {
    try {
      const raw = localStorage.getItem(lockKey);
      if (!raw) return null;
      return JSON.parse(raw) as RefreshLock;
    } catch {
      return null;
    }
  }

  function writeLock(lock: RefreshLock): void {
    try {
      localStorage.setItem(lockKey, JSON.stringify(lock));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  function removeLock(): void {
    try {
      localStorage.removeItem(lockKey);
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  // ── TabCoordinator implementation ──────────────────────────────────────────

  function acquireLock(): boolean {
    try {
      const existing = readLock();
      const now = Date.now();

      if (existing && existing.tabId !== tabId && now - existing.acquiredAt <= lockTtlMs) {
        // Lock is held by another tab and has not expired
        return false;
      }

      // Lock is absent, expired, or held by this tab — (re)acquire it
      writeLock({ tabId, acquiredAt: now });
      return true;
    } catch {
      // If localStorage is completely broken, allow the refresh to proceed
      return true;
    }
  }

  function releaseLock(): void {
    try {
      const existing = readLock();
      // Only remove the lock if this tab owns it
      if (existing && existing.tabId === tabId) {
        removeLock();
      }
    } catch {
      // Silently ignore
    }
  }

  function isLeader(): boolean {
    try {
      const existing = readLock();
      if (!existing) return false;
      const now = Date.now();
      return existing.tabId === tabId && now - existing.acquiredAt <= lockTtlMs;
    } catch {
      return false;
    }
  }

  function broadcast(message: SyncMessage): void {
    if (!channel) return;
    try {
      channel.postMessage(message);
    } catch {
      // BroadcastChannel may be closed — silently ignore
    }
  }

  function onMessage(handler: (message: SyncMessage) => void): () => void {
    messageHandlers.add(handler);
    return () => {
      messageHandlers.delete(handler);
    };
  }

  function isNearExpiry(session: Session | null): boolean {
    if (!session) return true;
    try {
      const expiresAt = session.expires_at; // Unix seconds
      if (typeof expiresAt !== "number") return true;
      const nowSec = Date.now() / 1000;
      return expiresAt - nowSec < nearExpiryThresholdSec;
    } catch {
      return true;
    }
  }

  function destroy(): void {
    messageHandlers.clear();
    if (channel) {
      try {
        channel.close();
      } catch {
        // Silently ignore
      }
      channel = null;
    }
  }

  return {
    acquireLock,
    releaseLock,
    isLeader,
    broadcast,
    onMessage,
    isNearExpiry,
    destroy,
  };
}
