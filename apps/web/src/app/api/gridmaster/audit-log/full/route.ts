import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  actionPrefix: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
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
      action: req.nextUrl.searchParams.get("action") ?? undefined,
      actionPrefix: req.nextUrl.searchParams.get("actionPrefix") ?? undefined,
      resourceType: req.nextUrl.searchParams.get("resourceType") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    let query = getServiceClient()
      .from("audit_log")
      .select(
        "id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, created_at",
      )
      .order("created_at", { ascending: false })
      .range(
        parsed.data.offset ?? 0,
        (parsed.data.offset ?? 0) + (parsed.data.limit ?? 50) - 1,
      );

    if (parsed.data.orgId) {
      query = query.eq("org_id", parsed.data.orgId);
    }
    if (parsed.data.action) {
      query = query.eq("action", parsed.data.action);
    }
    if (parsed.data.actionPrefix) {
      query = query.like("action", `${parsed.data.actionPrefix}%`);
    }
    if (parsed.data.resourceType) {
      query = query.eq("resource_type", parsed.data.resourceType);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as number,
        orgId: (row.org_id as string | null) ?? null,
        actorId: (row.actor_id as string | null) ?? null,
        actorEmail: (row.actor_email as string | null) ?? null,
        action: row.action as string,
        resourceType: row.resource_type as string,
        resourceId: (row.resource_id as string | null) ?? null,
        details: (row.details ?? {}) as Record<string, unknown>,
        createdAt: row.created_at as string,
      })),
    });
  } catch (error) {
    console.error("gridmaster full audit-log GET failed", error);
    return NextResponse.json(
      { error: "Failed to load full audit log" },
      { status: 500 },
    );
  }
}
