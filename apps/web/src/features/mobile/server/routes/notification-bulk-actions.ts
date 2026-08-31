import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  mobileNotificationBulkBodySchema,
  mobileNotificationBulkResponseSchema,
} from "@dubgrid/contracts";
import { bulkMutateMobileNotifications } from "@dubgrid/mobile-api-core";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = mobileNotificationBulkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const payload = await bulkMutateMobileNotifications(auth, parsed.data);
    return NextResponse.json(mobileNotificationBulkResponseSchema.parse(payload));
  } catch {
    return NextResponse.json({ error: "We couldn't update those notifications." }, { status: 400 });
  }
}
