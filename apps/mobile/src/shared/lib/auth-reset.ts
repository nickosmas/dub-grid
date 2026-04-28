import { router } from "expo-router";
import { replaceAuthSession } from "../providers/AuthSessionProvider";
import { queryClient } from "./query-client";
import { getSupabaseClient } from "./supabase";

let activeReset: Promise<void> | null = null;

export async function handleExpiredMobileSession(options?: {
  skipSignOut?: boolean;
}): Promise<void> {
  if (activeReset) {
    return activeReset;
  }

  activeReset = (async () => {
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
