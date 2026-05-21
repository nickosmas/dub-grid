import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import type { NotificationFacets } from "@/types";
import { mapNotificationRow } from "../route";

const cursorSchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
});

const searchBodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: cursorSchema.nullable().optional(),
  read: z.enum(["unread", "read"]).nullable().optional(),
  category: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).nullable().optional(),
  includeArchived: z.boolean().optional(),
  search: z.string().nullable().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  facets: z.boolean().optional(),
});

const SAFE_SEARCH = /[^a-zA-Z0-9 .,_'-]/g;

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = searchBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const params = parsed.data;
    const limit = params.limit ?? 25;
    const ascending = params.sort === "asc";

    const supabase = createRequestSupabaseClient(req);

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("channel", "in_app");

    if (params.read === "unread") query = query.is("read_at", null);
    else if (params.read === "read") query = query.not("read_at", "is", null);

    if (params.includeArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (params.category) query = query.eq("category", params.category);
    if (params.priority) query = query.eq("priority", params.priority);

    if (params.search && params.search.trim().length > 0) {
      const term = params.search.trim().replace(SAFE_SEARCH, "");
      if (term.length > 0) {
        const escaped = term.replace(/[%_]/g, "\\$&");
        query = query.or(`title.ilike.%${escaped}%,message.ilike.%${escaped}%`);
      }
    }

    if (params.cursor) {
      const c = params.cursor;
      if (ascending) {
        query = query.or(
          `created_at.gt.${c.createdAt},and(created_at.eq.${c.createdAt},id.gt.${c.id})`,
        );
      } else {
        query = query.or(
          `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`,
        );
      }
    }

    query = query
      .order("created_at", { ascending })
      .order("id", { ascending })
      .limit(limit);

    const [rowsResult, facetsResult] = await Promise.all([
      query,
      params.facets
        ? supabase.rpc("get_notification_facets")
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (rowsResult.error) throw rowsResult.error;
    if (facetsResult.error) throw facetsResult.error;

    const rows = (rowsResult.data ?? []) as Record<string, unknown>[];
    const notifications = rows.map(mapNotificationRow);
    const last = notifications[notifications.length - 1];
    const nextCursor =
      notifications.length >= limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : null;

    return NextResponse.json({
      notifications,
      nextCursor,
      facets: (facetsResult.data ?? null) as NotificationFacets | null,
    });
  } catch (error) {
    console.error("notifications search failed", error);
    return NextResponse.json(
      { error: "Failed to search notifications" },
      { status: 500 },
    );
  }
}
