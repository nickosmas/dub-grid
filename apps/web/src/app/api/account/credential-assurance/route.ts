import { NextRequest, NextResponse } from "next/server";

import { requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

/**
 * Preflight public Supabase credential mutations with DubGrid's stricter
 * five-minute assurance policy. Supabase remains the mutation boundary.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireSensitiveActionAuth(req);
    if ("response" in auth) return auth.response;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "credential assurance POST failed");
    return NextResponse.json(
      { error: "We couldn't confirm your identity. Try again." },
      { status: 500 },
    );
  }
}
