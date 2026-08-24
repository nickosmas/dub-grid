import { NextResponse, type NextRequest } from "next/server";
import { formatClientErrorMessage } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import {
  mobileUpdateShiftRequestBodySchema,
  mobileUpdateShiftRequestResponseSchema,
} from "@dubgrid/contracts";
import { updateMobileShiftRequest } from "@dubgrid/mobile-api-core";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

/**
 * A shift-request failure is usually a rule the caller broke ("You already
 * volunteered for this open shift"), so the message is worth surfacing — but
 * the same catch also sees Postgres and Zod errors. `formatClientErrorMessage`
 * keeps the intentional copy and swaps anything technical for the fallback.
 */
const SHIFT_REQUEST_FALLBACK = "We couldn't complete that request. Try again.";

function clientSafeError(err: unknown): string {
  return formatClientErrorMessage(err, SHIFT_REQUEST_FALLBACK);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileUpdateShiftRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  try {
    await updateMobileShiftRequest(auth, id, parsed.data, {
      dispatchNotificationEvent,
    });

    return NextResponse.json(
      mobileUpdateShiftRequestResponseSchema.parse({
        success: true,
      }),
    );
  } catch (err) {
    logger.error({ err, route: "mobile/shift-requests" }, "Mobile shift request failed");
    return NextResponse.json({ error: clientSafeError(err) }, { status: 400 });
  }
}
