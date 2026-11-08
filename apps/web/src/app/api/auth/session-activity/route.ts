import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { createRequestSupabaseClient, requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Records that someone is using this web session, so the token hook keeps
 * renewing it (128). The browser sends it at most every five minutes of use.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedSession(req);
  if ("response" in auth) return auth.response;

  const { error } = await createRequestSupabaseClient(req).rpc("touch_web_session");
  if (error) {
    logger.warn({ error }, "Recording web session activity failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
