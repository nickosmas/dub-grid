import { NextRequest, NextResponse } from "next/server";
import { requireMobileSensitiveActionAuth } from "../auth";

/**
 * Preflight public Supabase credential mutations with DubGrid's stricter
 * five-minute assurance policy. Supabase remains the mutation boundary.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileSensitiveActionAuth(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
