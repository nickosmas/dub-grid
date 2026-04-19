import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePushTokenBodySchema,
  mobilePushTokenResponseSchema,
} from "@dubgrid/contracts";
import { requireMobileAuth, upsertMobilePushToken } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = mobilePushTokenBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await upsertMobilePushToken({
    userId: auth.user.id,
    orgId: auth.currentOrg.id,
    platform: parsed.data.platform,
    expoPushToken: parsed.data.expoPushToken,
    disabled: parsed.data.disabled,
  });

  return NextResponse.json(
    mobilePushTokenResponseSchema.parse({
      success: true,
    }),
  );
}
