import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { loadGridmasterOverview } from "@/app/api/gridmaster/_lib/oversight";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const overview = await loadGridmasterOverview(getServiceClient());
    return NextResponse.json(overview);
  } catch (error) {
    console.error("gridmaster overview GET failed", error);
    return NextResponse.json(
      { error: "Failed to load gridmaster overview" },
      { status: 500 },
    );
  }
}
