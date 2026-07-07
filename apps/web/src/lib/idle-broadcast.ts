const CHANNEL_NAME = "dg-idle-activity";
export const STORAGE_KEY = "dg_idle_last_activity";

type IdleActivityMessage = {
  type: "activity";
  at: number;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/**
 * Broadcast a user-activity timestamp to other tabs so an idle tab's timer
 * resets when the user is active in a different tab of the same browser.
 */
export function broadcastIdleActivity(at: number): void {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: "activity", at } satisfies IdleActivityMessage);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // Storage unavailable (private mode) — cross-tab sync is best-effort.
  }
}

/**
 * Listen for activity broadcasts from other tabs. Returns a cleanup function.
 */
export function listenForIdleActivity(onActivity: (at: number) => void): () => void {
  const ch = getChannel();
  if (ch) {
    const handler = (event: MessageEvent<IdleActivityMessage>) => {
      if (event.data?.type === "activity") onActivity(event.data.at);
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }

  // storage events only fire in OTHER tabs, which is exactly what's needed —
  // the writing tab already has the up-to-date timestamp locally.
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      const at = Number(event.newValue);
      if (!Number.isNaN(at)) onActivity(at);
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
