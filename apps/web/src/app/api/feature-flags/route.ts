import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getClientFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

/**
 * Client-visible subset of the platform kill switches (apps/web/src/lib/feature-flags.ts)
 * — only the flags with a real UI trigger. Any signed-in user may read this; it's used to
 * proactively disable buttons for a killed feature, not to gate anything itself, so it
 * doesn't need gridmaster scoping like /api/gridmaster/platform-flags.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json(await getClientFeatureFlags());
}
