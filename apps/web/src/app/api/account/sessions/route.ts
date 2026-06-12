import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchActiveUserSessionsForUser,
  revokeUserSessionForUser,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { API_ERRORS } from "@dubgrid/client-errors";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";

const revokeSessionSchema = z.object({
  refreshTokenHash: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      sessions: await fetchActiveUserSessionsForUser(auth.user.id),
    });
  } catch (error) {
    console.error("account sessions GET failed", error);
    return NextResponse.json(
      { error: "Failed to load sessions" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
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

    const parsed = revokeSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    // Capture device label + org from the session row before revoke so the
    // alert can name what was signed out. Best-effort — if the row is gone
    // (already revoked) we still proceed and skip the notification.
    const { data: priorRow } = await getServiceClient()
      .from("user_sessions")
      .select("org_id, device_label")
      .eq("user_id", auth.user.id)
      .eq("refresh_token_hash", parsed.data.refreshTokenHash)
      .maybeSingle();

    await revokeUserSessionForUser(auth.user.id, parsed.data.refreshTokenHash);

    if (priorRow) {
      void dispatchNotificationEvent(auth.user.id, {
        action: "security_session_revoked",
        orgId: (priorRow.org_id as string | null) ?? null,
        targetUserId: auth.user.id,
        initiatedBy: "self",
        deviceLabel: (priorRow.device_label as string | null) ?? null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("account sessions DELETE failed", error);
    return NextResponse.json(
      { error: "Failed to revoke session" },
      { status: 500 },
    );
  }
}
