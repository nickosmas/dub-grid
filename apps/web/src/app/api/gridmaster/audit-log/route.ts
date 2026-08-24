import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { createRequestSupabaseClient, requireGridmasterSession } from "@/lib/api-auth";
import logger from "@/lib/logger";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const { data, error } = await createRequestSupabaseClient(req).rpc("get_audit_log", {
      p_org_id: parsed.data.orgId ?? null,
      p_limit: parsed.data.limit ?? 50,
      p_offset: parsed.data.offset ?? 0,
    });
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        targetUserId: row.target_user_id as string,
        targetEmail: (row.target_email as string | null) ?? null,
        changedById: row.changed_by_id as string,
        changedByEmail: (row.changed_by_email as string | null) ?? null,
        fromRole: row.from_role as string,
        toRole: row.to_role as string,
        createdAt: row.created_at as string,
        orgId: (row.org_id as string | null) ?? null,
        orgName: (row.org_name as string | null) ?? null,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/audit-log" },
      "gridmaster audit-log GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the activity log. Refresh and try again." },
      { status: 500 },
    );
  }
}
