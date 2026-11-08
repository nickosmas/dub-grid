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

/**
 * The connect-src origins for a hosted project: that project alone, so a script
 * can't send data to another Supabase project. A local stack needs none here.
 */
export function hostedSupabaseConnectSources(supabaseUrl: string | undefined): string {
  if (supabaseUrl && LOOPBACK_SUPABASE_URL.test(supabaseUrl)) return "";
  try {
    const { host, protocol } = new URL(supabaseUrl ?? "");
    if (protocol === "https:") return `https://${host} wss://${host}`;
  } catch {
    // Unset or malformed: fall through to the platform's domain.
  }
  return "https://*.supabase.co wss://*.supabase.co";
}
