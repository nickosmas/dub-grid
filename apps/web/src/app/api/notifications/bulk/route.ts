import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";

const bulkSchema = z.object({
  action: z.enum(["read", "unread", "archive", "unarchive"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { action, ids } = parsed.data;

    const supabase = createRequestSupabaseClient(req);
    const now = new Date().toISOString();

    let error;
    switch (action) {
      case "read":
        ({ error } = await supabase
          .from("notifications")
          .update({ read_at: now })
          .in("id", ids));
        break;
      case "unread":
        ({ error } = await supabase
          .from("notifications")
          .update({ read_at: null })
          .in("id", ids));
        break;
      case "archive":
        ({ error } = await supabase
          .from("notifications")
          .update({ archived_at: now })
          .in("id", ids));
        break;
      case "unarchive":
        ({ error } = await supabase
          .from("notifications")
          .update({ archived_at: null })
          .in("id", ids));
        break;
    }

    if (error) throw error;

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("notifications bulk failed", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}
