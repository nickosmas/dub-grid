import { createBrowserClient } from "@supabase/ssr";

// Don't throw at module level — that crashes the page before React can handle
// the error. Call validateConfig() inside a try/catch at runtime instead.
export function validateConfig(): void {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Missing Supabase credentials. Copy .env.local.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

// Lazy singleton — the Proxy defers createBrowserClient() until the first
// property access, which only happens in the browser (inside useEffect).
// This prevents the module from throwing during SSR/prerendering when the
// NEXT_PUBLIC_ env vars have not yet been substituted into the bundle.
// createBrowserClient() returns the same instance on repeated calls, so the
// internal auth mutex is shared across all consumers.
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const value = (client as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});
