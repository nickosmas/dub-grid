import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

describe("installed Supabase bulk sign-out transport", () => {
  it.each(["others", "global"] as const)(
    "forwards the verified caller token and %s scope without a stored session",
    async (scope) => {
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const client = createClient("https://test.invalid", "publishable-key", {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
          storageKey: `bulk-sign-out-${scope}`,
        },
        global: { fetch, headers: { Authorization: "Bearer verified-fresh-token" } },
      });
      const result = await client.auth.admin.signOut("verified-fresh-token", scope);
      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(`https://test.invalid/auth/v1/logout?scope=${scope}`);
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer verified-fresh-token");
      expect(new Headers(init.headers).get("apikey")).toBe("publishable-key");
    },
  );
});
