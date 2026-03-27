import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side auth confirmation route.
 *
 * Email templates use {{ .TokenHash }} to generate links like:
 *   /auth/confirm?token_hash=xxx&type=recovery&next=/reset-password
 *
 * This route verifies the OTP server-side (no PKCE verifier needed),
 * establishes the session via cookies, and redirects to the `next` path.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = next;
      redirectTo.searchParams.delete("token_hash");
      redirectTo.searchParams.delete("type");
      redirectTo.searchParams.delete("next");
      return NextResponse.redirect(redirectTo);
    }
  }

  // Invalid or expired token — redirect to the target page with an error flag
  const errorRedirect = request.nextUrl.clone();
  errorRedirect.pathname = type === "recovery" ? "/reset-password" : "/login";
  errorRedirect.searchParams.set("error", "invalid_link");
  errorRedirect.searchParams.delete("token_hash");
  errorRedirect.searchParams.delete("type");
  errorRedirect.searchParams.delete("next");
  return NextResponse.redirect(errorRedirect);
}
