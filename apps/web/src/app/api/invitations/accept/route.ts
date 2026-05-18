import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/error-handling";

const postSchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token: parsed.data.token,
    });
    if (error) throw error;

    return NextResponse.json({
      status: data.status as string,
      orgId: data.org_id as string,
      role: data.role as string,
      orgSlug: (data.org_slug as string | null) ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to accept invitation");
  }
}
