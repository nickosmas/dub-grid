import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    if (!browserClient) {
      // clientEnv is a lazy proxy now, so it is never null; the real question
      // was always whether the values it resolves are present.
      if (
        !clientEnv?.NEXT_PUBLIC_SUPABASE_URL ||
        !clientEnv?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ) {
        throw new Error(
          "Missing Supabase credentials. Keep your values in the repo-root .env.local (copy from .env.example if needed) and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        );
      }
      browserClient = createBrowserClient(
        clientEnv.NEXT_PUBLIC_SUPABASE_URL,
        clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      );
    }
    const value = (browserClient as unknown as Record<string, unknown>)[prop as string];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(browserClient)
      : value;
  },
});
