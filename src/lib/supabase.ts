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

// Singleton browser client — createBrowserClient returns the same instance on
// repeated calls, so the internal auth mutex is shared across all consumers.
// Cookie-based storage ensures the middleware and browser client stay in sync.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
