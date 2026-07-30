import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { loadGridmasterSecurity } from "@/app/api/gridmaster/_lib/oversight";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await loadGridmasterSecurity(getServiceClient()));
  } catch (error) {
    logger.error({ error }, "gridmaster security GET failed");
    return NextResponse.json({ error: "Failed to load security oversight" }, { status: 500 });
  }
}
