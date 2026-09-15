import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchUserSessionOverviewForUser,
  revokeUserSessionForUser,
} from "@/features/account/server";
import { requireSensitiveActionAuth, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";

const revokeSessionSchema = z.object({
  refreshTokenHash: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(
      await fetchUserSessionOverviewForUser(auth.user.id, {
        currentSupabaseSessionId:
          typeof auth.claims.session_id === "string" ? auth.claims.session_id : null,
      }),
    );
  } catch (error) {
    logger.error({ error }, "account sessions GET failed");
    return NextResponse.json(
      { error: "We couldn't load your devices. Refresh and try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireSensitiveActionAuth(req);
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
    logger.error({ error }, "account sessions DELETE failed");
    return NextResponse.json(
      { error: "We couldn't sign out that device. Try again." },
      { status: 500 },
    );
  }
}
