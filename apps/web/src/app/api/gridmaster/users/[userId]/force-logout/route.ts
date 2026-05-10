import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const result = await createRequestSupabaseClient(req).rpc(
      "force_logout_user",
      {
        p_target_user_id: parsed.data.userId,
      },
    );

    if (result.error) {
      throw result.error;
    }

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "user.force_logout",
      resourceType: "user",
      resourceId: parsed.data.userId,
      details: { targetUserId: parsed.data.userId },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("gridmaster force logout POST failed", error);
    return NextResponse.json(
      { error: "Failed to force logout user" },
      { status: 500 },
    );
  }
}
