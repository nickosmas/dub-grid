import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiErrorResponse } from "@/lib/error-handling";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { API_ERRORS } from "@dubgrid/client-errors";

const postSchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token: parsed.data.token,
    });
    if (error) throw error;

    const orgId = data.org_id as string;
    if (orgId) {
      void dispatchNotificationEvent(auth.user.id, {
        action: "invitation_accepted",
        orgId,
        acceptedUserId: auth.user.id,
        invitationId: (data.invitation_id as string | null | undefined) ?? null,
      });
    }

    return NextResponse.json({
      status: data.status as string,
      orgId,
      role: data.role as string,
      orgSlug: (data.org_slug as string | null) ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to accept invitation");
  }
}
