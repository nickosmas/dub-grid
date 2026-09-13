import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthActionDestination } from "@/lib/auth/integrity-contract";

/**
 * Server-side auth confirmation route.
 *
 * Email templates use {{ .TokenHash }} to generate links like:
 *   /auth/confirm?token_hash=xxx&type=recovery&next=/reset-password
 *
 * This compatibility route never consumes the OTP on GET. It forwards a valid
 * action to the scanner-safe verification page, where a human must continue.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const authAction = resolveAuthActionDestination(
    searchParams.get("type"),
    searchParams.get("next"),
  );

  if (tokenHash && authAction) {
    const verification = new URL("/auth/verify", request.nextUrl.origin);
    verification.searchParams.set("token_hash", tokenHash);
    verification.searchParams.set("type", authAction.action);
    verification.searchParams.set("next", authAction.destination);
    return NextResponse.redirect(verification);
  }

  // Invalid or expired token — redirect to the target page with an error flag
  const errorRedirect = request.nextUrl.clone();
  errorRedirect.pathname = authAction?.action === "recovery" ? "/reset-password" : "/login";
  errorRedirect.searchParams.set("error", "invalid_link");
  errorRedirect.searchParams.delete("token_hash");
  errorRedirect.searchParams.delete("type");
  errorRedirect.searchParams.delete("next");
  return NextResponse.redirect(errorRedirect);
}
