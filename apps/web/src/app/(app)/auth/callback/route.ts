import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/lib/supabase-keys";
import { parseInternalDestination } from "@/lib/auth/integrity-contract";

/**
 * Server-side PKCE code exchange callback.
 *
 * When Supabase redirects after email verification (password reset, signup
 * confirmation, etc.), it appends `?code=xxx` to the redirect URL. This route
 * exchanges that code for a session server-side — where the code_verifier
 * stored in cookies by @supabase/ssr is accessible — then redirects to the
 * final destination specified by the `next` query parameter.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = parseInternalDestination(rawNext, "/");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectTo = new URL(next, request.nextUrl.origin);
      return NextResponse.redirect(redirectTo);
    }
  }

  // Code exchange failed — redirect with error flag
  const errorRedirect = request.nextUrl.clone();
  errorRedirect.pathname = next === "/reset-password" ? "/reset-password" : "/login";
  errorRedirect.searchParams.set("error", "invalid_link");
  errorRedirect.searchParams.delete("code");
  errorRedirect.searchParams.delete("next");
  return NextResponse.redirect(errorRedirect);
}
