import { NextResponse, type NextRequest } from "next/server";
import {
  mobileUpdateShiftRequestBodySchema,
  mobileUpdateShiftRequestResponseSchema,
} from "@dubgrid/contracts";
import { updateMobileShiftRequest } from "@dubgrid/mobile-api-core";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unexpected error";
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
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
