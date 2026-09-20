import { NextResponse, type NextRequest } from "next/server";
import {
  mobileCalendarSubscriptionIssuedSchema,
  mobileCalendarSubscriptionStatusSchema,
} from "@dubgrid/contracts";
import {
  CalendarSubscriptionError,
  getCalendarSubscriptionStatus,
  issueCalendarSubscription,
  revokeCalendarSubscription,
} from "@/features/account/server";
import { requireMobileAuth } from "@/features/mobile/server";
import logger from "@/lib/logger";

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
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;
  const orgId = auth.currentOrg?.id;
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
    return NextResponse.json(
      mobileCalendarSubscriptionStatusSchema.parse({
        active: status.active,
        issuedAt: status.issuedAt,
      }),
    );
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, "mobile calendar subscription status failed");
    return NextResponse.json(
      { error: "We couldn't load your calendar subscription. Try again." },
      { status: 500 },
    );
  }
}

async function issue(req: NextRequest, mode: "create" | "rotate") {
  try {
    const caller = await requireCalendarCaller(req);
    if ("response" in caller) return caller.response;
    const result = await issueCalendarSubscription(caller.userId, caller.orgId, mode);
    return NextResponse.json(
      mobileCalendarSubscriptionIssuedSchema.parse({
        active: true,
        issuedAt: result.issuedAt,
        feedUrl: new URL(`/api/calendar/feed/${result.rawToken}`, req.nextUrl.origin).toString(),
      }),
    );
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, `mobile calendar subscription ${mode} failed`);
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
  try {
    const caller = await requireCalendarCaller(req);
    if ("response" in caller) return caller.response;
    await revokeCalendarSubscription(caller.userId, caller.orgId);
    return NextResponse.json(
      mobileCalendarSubscriptionStatusSchema.parse({ active: false, issuedAt: null }),
    );
  } catch (error) {
    const response = subscriptionErrorResponse(error);
    if (response) return response;
    logger.error({ error }, "mobile calendar subscription revoke failed");
    return NextResponse.json(
      { error: "We couldn't disable your calendar subscription. Try again." },
      { status: 500 },
    );
  }
}
