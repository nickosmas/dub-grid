/**
 * Unique per-mount channel name. Reusing a static name across an effect's
 * StrictMode double-invoke (or a fast remount) can silently attach to an
 * already-subscribed channel instead of opening a fresh one.
 */
export function createRealtimeChannelName(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
