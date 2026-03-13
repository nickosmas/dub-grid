import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { UserClaims } from "@/types";

// ── JWT decoder (no signature verification — safe for reading claims only) ────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Server-side Supabase client ───────────────────────────────────────────────
// Used in Server Components and Route Handlers (not middleware).

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        // Server Components are read-only — set/remove are no-ops here.
        // Use a Route Handler or middleware if you need to write cookies.
        set() { },
        remove() { },
      },
    },
  );
}

// ── Primary helper: read claims from the JWT ─────────────────────────────
//
// Reads custom claims that the custom_access_token_hook embedded at login time.
// This is a zero-DB-query path — perfect for Server Components that need to
// gate UI before any data fetch.
//
// Falls back to safe defaults if there's no session or no custom claims yet
// (e.g. the hook hasn't been registered yet during initial setup).

export async function getServerUserClaims(): Promise<UserClaims | null> {
  const supabase = await createServerSupabaseClient();

  // Use getUser() to authenticate the user via the Supabase Auth server,
  // then read JWT claims from the session's access_token.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const raw = decodeJwtPayload(session.access_token);

  let companyId = typeof raw?.company_id === "string" ? raw.company_id : null;
  let companySlug = typeof raw?.company_slug === "string" ? raw.company_slug : null;

  // Fallback to database query if JWT claims are missing
  if (!companySlug) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, companies(slug)")
        .eq("id", user.id)
        .single();

      if (profile) {
        companyId = profile.company_id;
        const companies = profile.companies as any;
        companySlug = Array.isArray(companies) ? companies[0]?.slug : companies?.slug || null;
      }
    } catch (err: any) {
      const isAbortError =
        err?.name === "AbortError" ||
        err?.message?.includes("aborted") ||
        err?.code === "ECONNRESET";

      if (!isAbortError) {
        console.error("Failed to fetch profile fallback", err);
      }
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    companyId,
    companySlug,
  };
}

// ── Guard for Server Components ───────────────────────────────────────────────
// Returns the user's claims, asserting they are authenticated.
// Throws an error (which Next.js surfaces as a 403) if the check fails.
// Use this at the top of a Server Component or page to gate access server-side.

export async function requireAuth(): Promise<UserClaims> {
  const claims = await getServerUserClaims();

  if (!claims) {
    throw new Error("Unauthenticated");
  }

  return claims;
}
