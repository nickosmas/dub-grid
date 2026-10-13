import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { stripeMode } from "@/lib/stripe";
import {
  loadGridmasterBilling,
  loadGridmasterOrgBilling,
} from "@/app/api/gridmaster/_lib/oversight";
import logger from "@/lib/logger";

const orgIdSchema = z.string().uuid();

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const orgIdParam = req.nextUrl.searchParams.get("orgId");
    if (orgIdParam !== null) {
      const orgId = orgIdSchema.safeParse(orgIdParam);
      if (!orgId.success) {
        return NextResponse.json({ error: "Invalid organization." }, { status: 400 });
      }
      const organization = await loadGridmasterOrgBilling(getServiceClient(), orgId.data);
      if (!organization) {
        return NextResponse.json({ error: "Organization not found." }, { status: 404 });
      }
      return NextResponse.json({ organization, stripeMode: stripeMode() });
    }

    return NextResponse.json({
      ...(await loadGridmasterBilling(getServiceClient())),
      stripeMode: stripeMode(),
    });
  } catch (error) {
    logger.error({ err: error, path: "/api/gridmaster/billing" }, "gridmaster billing GET failed");
    return NextResponse.json(
      { error: "We couldn't load the billing overview. Refresh and try again." },
      { status: 500 },
    );
  }
}
