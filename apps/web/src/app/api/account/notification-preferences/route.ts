import { NextRequest, NextResponse } from "next/server";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { mobileNotificationPreferencesUpdateBodySchema } from "@dubgrid/contracts";
import { API_ERRORS } from "@dubgrid/client-errors";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      prefs: await fetchNotificationPreferences(auth.user.id),
    });
  } catch (error) {
    logger.error({ error }, "account notification preferences GET failed");
    return NextResponse.json(
      { error: "We couldn't load your notification settings. Refresh and try again." },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
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

    const parsed = mobileNotificationPreferencesUpdateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    return NextResponse.json({
      prefs: await saveNotificationPreferences(auth.user.id, parsed.data.prefs),
    });
  } catch (error) {
    logger.error({ error }, "account notification preferences PUT failed");
    return NextResponse.json(
      { error: "We couldn't save your notification settings. Try again." },
      { status: 500 },
    );
  }
}
