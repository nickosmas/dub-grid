const LOOPBACK_SUPABASE_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/;

/**
 * The connect-src origins the browser needs for a local Supabase stack, on
 * whichever port that stack serves. Empty for a hosted project, so a real
 * deployment's policy never loosens.
 */
export function localSupabaseConnectSources(supabaseUrl: string | undefined): string {
  if (!supabaseUrl || !LOOPBACK_SUPABASE_URL.test(supabaseUrl)) return "";
  const url = new URL(supabaseUrl);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return ["127.0.0.1", "localhost"]
    .flatMap((host) => [`http://${host}:${port}`, `ws://${host}:${port}`])
    .join(" ");
}
