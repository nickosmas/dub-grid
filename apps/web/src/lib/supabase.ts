import { createBrowserClient } from "@supabase/ssr";

export function validateConfig(): void {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Missing Supabase credentials. Keep your values in the repo-root .env.local (copy from .env.example if needed) and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    if (!browserClient) {
      validateConfig();
      browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
    }
    const value = (browserClient as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(browserClient) : value;
  },
});
