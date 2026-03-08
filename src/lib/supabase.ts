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

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    if (!browserClient) {
      browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
    }
    const value = (browserClient as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? (value as Function).bind(browserClient) : value;
  },
});
