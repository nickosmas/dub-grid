import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export type AuthEventUser =
  /** Commit this user (null: the session is no longer valid). */
  | { kind: "commit"; user: User | null }
  /** Couldn't tell; leave the signed-in state as it is. */
  | { kind: "keep" };

const TRUSTED_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "SIGNED_IN",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
]);

/**
 * Decides who an auth event's session belongs to.
 *
 * `verify` resolves null when the auth server rejects the session and throws
 * when it can't be reached. Only the first signs out: a laptop waking from
 * sleep fails the check on the network, and treating that as signed out wiped
 * every cached query, leaving the Schedule empty and shifts as "?"
 * (2026-11-15).
 */
export async function resolveAuthEventUser({
  event,
  session,
  currentUser,
  verify,
}: {
  event: AuthChangeEvent;
  session: Session;
  currentUser: User | null;
  verify: () => Promise<User | null>;
}): Promise<AuthEventUser> {
  // The auth server returned this user in the same exchange that emitted it.
  if (TRUSTED_EVENTS.has(event) && session.user) return { kind: "commit", user: session.user };
  try {
    return { kind: "commit", user: await verify() };
  } catch {
    if (currentUser && session.user?.id === currentUser.id) {
      return { kind: "commit", user: currentUser };
    }
    return { kind: "keep" };
  }
}
