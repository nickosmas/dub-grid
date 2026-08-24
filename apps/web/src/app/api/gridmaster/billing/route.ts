import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { loadGridmasterBilling } from "@/app/api/gridmaster/_lib/oversight";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await loadGridmasterBilling(getServiceClient()));
  } catch (error) {
    logger.error({ err: error, path: "/api/gridmaster/billing" }, "gridmaster billing GET failed");
    return NextResponse.json(
      { error: "We couldn't load the billing overview. Refresh and try again." },
      { status: 500 },
    );
  }
}
