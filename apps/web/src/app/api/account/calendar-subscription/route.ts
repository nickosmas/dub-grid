import { NextRequest, NextResponse } from "next/server";

import {
  CalendarSubscriptionError,
  getCalendarSubscriptionStatus,
  issueCalendarSubscription,
  revokeCalendarSubscription,
} from "@/features/account/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

function getOrgId(claims: { org_id?: unknown }): string | null {
  return typeof claims.org_id === "string" ? claims.org_id : null;
}

function subscriptionErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CalendarSubscriptionError)) return null;
  if (error.code === "not_linked") {
    return NextResponse.json({ error: "No active scheduled profile was found." }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Your calendar subscription changed. Refresh and try again." },
    { status: 409 },
  );
}

async function requireCalendarCaller(req: NextRequest) {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth;
  const orgId = getOrgId(auth.claims);
  if (!orgId) {
    return {
      response: NextResponse.json({ error: "No active organization was found." }, { status: 404 }),
    };
  }
  return { userId: auth.user.id, orgId };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCalendarCaller(req);
    if ("response" in caller) return caller.response;
    const status = await getCalendarSubscriptionStatus(caller.userId, caller.orgId);
    return NextResponse.json({ active: status.active, issuedAt: status.issuedAt });
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, "calendar subscription status failed");
    return NextResponse.json(
      { error: "We couldn't load your calendar subscription. Try again." },
      { status: 500 },
    );
  }
}

async function issue(req: NextRequest, mode: "create" | "rotate") {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const caller = await requireCalendarCaller(req);
    if ("response" in caller) return caller.response;
    const result = await issueCalendarSubscription(caller.userId, caller.orgId, mode);
    return NextResponse.json({
      active: true,
      issuedAt: result.issuedAt,
      feedUrl: new URL(`/api/calendar/feed/${result.rawToken}`, req.nextUrl.origin).toString(),
    });
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, `calendar subscription ${mode} failed`);
    return NextResponse.json(
      { error: "We couldn't update your calendar subscription. Try again." },
      { status: 500 },
    );
  }
}

export function POST(req: NextRequest) {
  return issue(req, "create");
}

export function PUT(req: NextRequest) {
  return issue(req, "rotate");
}

export async function DELETE(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const caller = await requireCalendarCaller(req);
    if ("response" in caller) return caller.response;
    await revokeCalendarSubscription(caller.userId, caller.orgId);
    return NextResponse.json({ active: false, issuedAt: null });
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, "calendar subscription revoke failed");
    return NextResponse.json(
      { error: "We couldn't disable your calendar subscription. Try again." },
      { status: 500 },
    );
  }
}
