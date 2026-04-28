import type { QueryClient } from "@tanstack/react-query";

const CHANNEL_NAME = "dg-cache-invalidation";

type InvalidationMessage = {
  type: "invalidate";
  queryKey: unknown[];
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
 * Broadcast a cache invalidation to other tabs.
 * Call after mutations to keep all tabs in sync.
 */
export function broadcastInvalidation(queryKey: readonly unknown[]): void {
  const ch = getChannel();
  if (!ch) return;
  const msg: InvalidationMessage = { type: "invalidate", queryKey: [...queryKey] };
  ch.postMessage(msg);
}

/**
 * Start listening for cache invalidation messages from other tabs.
 * Returns a cleanup function to stop listening.
 */
export function listenForInvalidations(queryClient: QueryClient): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  function handler(event: MessageEvent<InvalidationMessage>) {
    if (event.data?.type === "invalidate") {
      queryClient.invalidateQueries({ queryKey: event.data.queryKey });
    }
  }

  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
