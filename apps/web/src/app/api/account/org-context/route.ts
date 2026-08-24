import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import logger from "@/lib/logger";

async function handleGET(req: NextRequest, timer: Timer) {
  try {
    const auth = await timer.time("auth", () => requireAuthenticatedUserWithClaims(req));
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      orgId: typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
      isGridmaster: auth.claims.platform_role === "gridmaster",
    });
  } catch (error) {
    logger.error({ error }, "account org context GET failed");
    return NextResponse.json(
      { error: "We couldn't load your organization. Refresh and try again." },
      { status: 500 },
    );
  }
}

export const GET = withTiming(handleGET);
