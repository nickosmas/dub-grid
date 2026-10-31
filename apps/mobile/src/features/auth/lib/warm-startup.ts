import { getSupabaseClient } from "../../../shared/lib/supabase";
import { queryClient } from "../../../shared/lib/query-client";
import { startQueryPersistence } from "../../../shared/lib/query-persistence";
import { preloadThemePreference } from "../../../shared/lib/theme-preference";
import { createBootstrapQueryOptions } from "../hooks/useBootstrap";

let startupBeganAt: number | null = null;

/** When `warmStartup` ran, for the splash's minimum to count from launch; null in tests. */
export function getStartupBeganAt(): number | null {
  return startupBeganAt;
}

/**
 * Called once at module load, before fonts, the theme read and the first render.
 * Restores the persisted queries too.
 * Bootstrap used to wait for all three, then for the session provider to mount
 * and read the session again. Now the stored session (refreshed if it expired)
 * starts the same bootstrap query the splash gate reads, under the same key.
 */
export function warmStartup(): void {
  startupBeganAt = Date.now();
  preloadThemePreference();
  // The last session's bootstrap and Home, from the device, while the network
  // answers; a fresher answer always wins over a restored one.
  void startQueryPersistence();
  try {
    void getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        const accessToken = data.session?.access_token;
        if (accessToken) void queryClient.prefetchQuery(createBootstrapQueryOptions(accessToken));
      })
      .catch(() => undefined);
  } catch {
    // Invalid configuration: the configuration screen reports it.
  }
}
