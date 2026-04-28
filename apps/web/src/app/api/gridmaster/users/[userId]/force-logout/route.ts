import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const result = await getServiceClient().rpc("force_logout_user", {
      p_target_user_id: parsed.data.userId,
    });

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("gridmaster force logout POST failed", error);
    return NextResponse.json(
      { error: "Failed to force logout user" },
      { status: 500 },
    );
  }
}
