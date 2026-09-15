const CHANNEL_NAME = "dg-auth-boundary";
export const AUTH_BOUNDARY_STORAGE_KEY = "dg_auth_boundary_event";

type AuthBoundaryMessage = {
  type: "signed-out";
  at: number;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Tells sibling tabs on this organization origin that their session ended. */
export function broadcastBrowserSignOut(): void {
  const message: AuthBoundaryMessage = { type: "signed-out", at: Date.now() };
  const activeChannel = getChannel();
  if (activeChannel) {
    activeChannel.postMessage(message);
    return;
  }

  try {
    localStorage.setItem(AUTH_BOUNDARY_STORAGE_KEY, JSON.stringify(message));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers. The server
    // revocation boundary still rejects the sibling tab's next request.
  }
}

export function listenForBrowserSignOut(onSignOut: () => void): () => void {
  const activeChannel = getChannel();
  if (activeChannel) {
    const handler = (event: MessageEvent<AuthBoundaryMessage>) => {
      if (event.data?.type === "signed-out") onSignOut();
    };
    activeChannel.addEventListener("message", handler);
    return () => activeChannel.removeEventListener("message", handler);
  }

  const handler = (event: StorageEvent) => {
    if (event.key !== AUTH_BOUNDARY_STORAGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue) as Partial<AuthBoundaryMessage>;
      if (message.type === "signed-out") onSignOut();
    } catch {
      // Ignore malformed values from old or manually edited browser storage.
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
