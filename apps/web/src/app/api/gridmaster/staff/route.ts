import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import {
  STAFF_SEARCH_MIN_LENGTH,
  searchUnlinkedStaff,
  toSearchTerms,
} from "@/features/gridmaster/server/staff-search";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const terms = toSearchTerms(query);
    if (query.length < STAFF_SEARCH_MIN_LENGTH || terms.length === 0) {
      return NextResponse.json(
        { error: `Enter at least ${STAFF_SEARCH_MIN_LENGTH} characters to search.` },
        { status: 400 },
      );
    }

    return NextResponse.json({ staff: await searchUnlinkedStaff(getServiceClient(), terms) });
  } catch (error) {
    logger.error({ error }, "gridmaster staff search failed");
    return NextResponse.json({ error: "We couldn't search staff. Try again." }, { status: 500 });
  }
}
