import { router } from "expo-router";
import { replaceAuthSession } from "../providers/AuthSessionProvider";
import { registerPushToken } from "./api";
import { queryClient } from "./query-client";
import { loadStoredPushDevice } from "./session";
import { getSupabaseClient } from "./supabase";

let activeReset: Promise<void> | null = null;

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
      await disablePushForCurrentDevice();
    }

    queryClient.clear();

    if (!options?.skipSignOut) {
      try {
        await getSupabaseClient().auth.signOut({ scope: "local" });
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
