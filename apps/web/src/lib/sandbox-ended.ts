import { NextResponse } from "next/server";
import {
  SANDBOX_COOKIE_NAME,
  SANDBOX_ENDED_CODE,
  SANDBOX_ENDED_MESSAGE,
  SANDBOX_ENDED_NOTICE_COOKIE,
} from "@/lib/sandbox-cookie";

/** Clears the sandbox cookie and leaves the one-time "your sandbox ended" note. */
export function clearEndedSandboxCookies(response: NextResponse, protocol: string): void {
  response.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  response.cookies.set(SANDBOX_ENDED_NOTICE_COOKIE, "1", {
    path: "/",
    maxAge: 120,
    sameSite: "lax",
    // As the auth cookies: Secure over https only. WebKit drops a Secure cookie
    // set over plain http, even on localhost.
    secure: protocol === "https:",
  });
}

/**
 * Refusal for a request carrying a sandbox cookie that no longer names a
 * sandbox this session may use. It clears the cookie on the way out: without
 * that the HttpOnly cookie (which client JS cannot remove) kept every API call,
 * Exit included, refused for the cookie's full week, and the app sat on its
 * recovery screen with no banner and no way back to the real organization.
 */
export function sandboxEndedResponse(protocol: string): NextResponse {
  const response = NextResponse.json(
    { error: SANDBOX_ENDED_MESSAGE, code: SANDBOX_ENDED_CODE },
    { status: 403 },
  );
  clearEndedSandboxCookies(response, protocol);
  return response;
}
