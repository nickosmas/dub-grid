const CHANNEL_NAME = "dg-idle-activity";
// `dg_` so sign-out's storage wipe removes it.
export const STORAGE_KEY = "dg_idle_last_activity";

type IdleActivityMessage = {
  type: "activity";
  at: number;
  session: string | null;
};

type StoredIdleActivity = {
  at: number;
  session: string;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

function parseStored(raw: string | null, session: string): number | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredIdleActivity>;
    if (value.session !== session || typeof value.at !== "number") return null;
    return Number.isFinite(value.at) ? value.at : null;
  } catch {
    return null;
  }
}

/**
 * The session's last activity as any of its tabs recorded it, so a reload or
 * a tab that slept picks up the same idle deadline. Null for another session,
 * which is how a new sign-in starts its own clock.
 */
export function readIdleActivity(session: string | null): number | null {
  if (!session) return null;
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY), session);
  } catch {
    return null;
  }
}

export function writeIdleActivity(at: number, session: string | null): void {
  if (!session) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at, session } satisfies StoredIdleActivity));
  } catch {
    // Storage unavailable: each tab keeps its own clock.
  }
}

/**
 * Record user activity for the session and tell its other tabs, so an idle
 * tab's timer resets when the user is active in a different tab.
 */
export function broadcastIdleActivity(at: number, session: string | null): void {
  writeIdleActivity(at, session);
  getChannel()?.postMessage({ type: "activity", at, session } satisfies IdleActivityMessage);
}

/**
 * Listen for the session's activity in other tabs. Returns a cleanup function.
 */
export function listenForIdleActivity(
  session: string | null,
  onActivity: (at: number) => void,
): () => void {
  const ch = getChannel();
  if (ch) {
    const handler = (event: MessageEvent<IdleActivityMessage>) => {
      if (event.data?.type === "activity" && event.data.session === session) {
        onActivity(event.data.at);
      }
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }

  // storage events only fire in OTHER tabs, which is exactly what's needed —
  // the writing tab already has the up-to-date timestamp locally.
  const handler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !session) return;
    const at = parseStored(event.newValue, session);
    if (at !== null) onActivity(at);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
