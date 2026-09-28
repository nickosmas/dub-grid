import { NextRequest, NextResponse } from "next/server";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import {
  STAFF_SEARCH_MIN_LENGTH,
  searchUnlinkedStaff,
  toSearchTerms,
} from "@/features/gridmaster/server/staff-search";

/** A POST, so a name, email or phone searched for never lands in a request log's URL (F-94). */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const raw = (body as { q?: unknown } | null)?.q;
    const query = (typeof raw === "string" ? raw : "").trim();
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
