import { router } from "expo-router";
import { replaceAuthSession } from "../providers/AuthSessionProvider";
import { registerPushToken, signOutMobileSessions } from "./api";
import { queryClient } from "./query-client";
import { loadStoredPushDevice } from "./session";
import { getSupabaseClient } from "./supabase";

let activeReset: Promise<void> | null = null;
const LOCAL_RESET_STEP_TIMEOUT_MS = 5_000;

async function settleWithin(promise: Promise<unknown>): Promise<void> {
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, LOCAL_RESET_STEP_TIMEOUT_MS)),
  ]);
}

/**
 * Tell the server to stop pushing to this device. Without it, a signed-out
 * device keeps receiving the previous user's notifications until someone else
 * signs in on it and the token row is reassigned.
 *
 * This needs a still-valid access token, so callers that sign out themselves
 * must call it **before** `signOut()`. `handleExpiredMobileSession` runs it for
 * the paths where it owns the sign-out. Always best-effort: the 401 recovery
 * path has no usable token and simply no-ops.
 */
export async function disablePushForCurrentDevice(): Promise<void> {
  try {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return;

    const storedDevice = await loadStoredPushDevice();
    if (!storedDevice) return;

    await registerPushToken(accessToken, { ...storedDevice, disabled: true });
  } catch {
    // Never block sign-out on push cleanup.
  }
}

/**
 * Record this device's sign-out in DubGrid while its token is still readable,
 * so a copy of the token stops working now rather than when it expires.
 * Best-effort, like push cleanup: it must never trap anyone signed in.
 */
export async function revokeCurrentMobileSession(): Promise<void> {
  try {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    if (!session?.access_token) return;
    await signOutMobileSessions(session.access_token, { scope: "local" });
  } catch {
    // The local sign-out still runs.
  }
}

/**
 * Tear down for a 401 only when the rejected token is still the one in use.
 * A request can outlive a refresh or an organization switch, and its late 401
 * used to sign out whichever session had replaced it (finding F-18). A stale
 * request now fails on its own; the live session stays.
 */
export async function handleRejectedMobileToken(rejectedToken: string): Promise<void> {
  let liveToken: string | null = null;
  try {
    const result = await Promise.race([
      getSupabaseClient().auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCAL_RESET_STEP_TIMEOUT_MS)),
    ]);
    liveToken = result?.data.session?.access_token ?? null;
  } catch {
    liveToken = null;
  }
  if (liveToken && liveToken !== rejectedToken) return;
  await handleExpiredMobileSession();
}

export async function handleExpiredMobileSession(options?: {
  skipSignOut?: boolean;
}): Promise<void> {
  if (activeReset) {
    return activeReset;
  }

  activeReset = (async () => {
    if (!options?.skipSignOut) {
      // Only meaningful while the session is still live, which is exactly the
      // case we still own. `skipSignOut` callers have already signed out, so
      // they are responsible for calling `disablePushForCurrentDevice` first.
      await settleWithin(disablePushForCurrentDevice());
      await settleWithin(revokeCurrentMobileSession());
    }

    queryClient.clear();

    if (!options?.skipSignOut) {
      try {
        await settleWithin(getSupabaseClient().auth.signOut({ scope: "local" }));
      } catch {
        // Ignore local sign-out failures during forced session recovery.
      }
    }

    replaceAuthSession(null);
    router.replace("/(auth)/login");
  })().finally(() => {
    activeReset = null;
  });

  return activeReset;
}
