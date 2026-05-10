import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { loadGridmasterCompliance } from "@/app/api/gridmaster/_lib/oversight";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await loadGridmasterCompliance(getServiceClient()));
  } catch (error) {
    console.error("gridmaster compliance GET failed", error);
    return NextResponse.json(
      { error: "Failed to load compliance oversight" },
      { status: 500 },
    );
  }
}
