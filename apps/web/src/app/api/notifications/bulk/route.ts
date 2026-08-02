import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";

const bulkSchema = z.object({
  action: z.enum(["read", "unread", "archive", "unarchive"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) return auth.response;
    const { user, claims } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }
    const { action, ids } = parsed.data;

    const supabase = createRequestSupabaseClient(req);
    const now = new Date().toISOString();

    // Scope the mutation to the caller's current session org. Without this,
    // a multi-org user could mutate notifications belonging to another org by
    // passing their IDs. Platform notifications (org_id IS NULL) are included
    // so users can still mark their own platform notifications read/archived.
    // RLS enforces the same; this is defense-in-depth at the route layer.
    const claimOrgId = typeof claims.org_id === "string" ? claims.org_id : null;
    const orgFilter = claimOrgId ? (`org_id.eq.${claimOrgId},org_id.is.null` as const) : null;

    const patch =
      action === "read"
        ? { read_at: now }
        : action === "unread"
          ? { read_at: null }
          : action === "archive"
            ? { archived_at: now }
            : { archived_at: null };

    const base = supabase.from("notifications").update(patch).in("id", ids).eq("user_id", user.id);
    const scoped = orgFilter ? base.or(orgFilter) : base.is("org_id", null);
    const { error } = await scoped;

    if (error) throw error;

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error({ error }, "notifications bulk failed");
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
