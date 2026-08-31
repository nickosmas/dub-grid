import { NextResponse, type NextRequest } from "next/server";
import { mobileNotificationReadResponseSchema } from "@dubgrid/contracts";
import {
  markAllMobileNotificationsRead,
  markMobileNotificationRead,
} from "@dubgrid/mobile-api-core";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    try {
      const payload = await markMobileNotificationRead(auth, id);

      return NextResponse.json(mobileNotificationReadResponseSchema.parse(payload));
    } catch {
      return NextResponse.json(
        { error: "We could not update that notification." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "We could not update that notification." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    try {
      const payload = await markAllMobileNotificationsRead(auth);

      return NextResponse.json(mobileNotificationReadResponseSchema.parse(payload));
    } catch {
      return NextResponse.json(
        { error: "We could not update your notifications." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "We could not update your notifications." }, { status: 500 });
  }
}
