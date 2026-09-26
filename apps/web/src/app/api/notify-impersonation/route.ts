import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

/**
 * Retired (41c3). Impersonation notices are sent by the server when a session
 * starts or ends (`/api/gridmaster/impersonation`), once each. This answered a
 * browser request, which a closed tab lost and a repeated call re-sent.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json(
    { success: false, error: "Impersonation notices are now sent automatically." },
    { status: 410 },
  );
}
