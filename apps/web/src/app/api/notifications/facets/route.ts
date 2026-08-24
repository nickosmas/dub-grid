import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import type { NotificationFacets } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    void auth;

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("get_notification_facets");
    if (result.error) throw result.error;

    return NextResponse.json(result.data as NotificationFacets);
  } catch (error) {
    logger.error({ error }, "notifications facets failed");
    return NextResponse.json(
      { error: "We couldn't load the alert filters. Refresh and try again." },
      { status: 500 },
    );
  }
}
