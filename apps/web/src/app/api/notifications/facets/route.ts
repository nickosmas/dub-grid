import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
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
    console.error("notifications facets failed", error);
    return NextResponse.json({ error: "Failed to load notification facets" }, { status: 500 });
  }
}
