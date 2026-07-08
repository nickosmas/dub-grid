import { NextResponse, type NextRequest } from "next/server";
import { mobilePushTokenBodySchema, mobilePushTokenResponseSchema } from "@dubgrid/contracts";
import { registerMobilePushToken } from "@dubgrid/mobile-api-core";
import { requireMobileAuth, upsertMobilePushToken } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobilePushTokenBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  const payload = await registerMobilePushToken(auth, parsed.data, {
    upsertMobilePushToken,
  });

  return NextResponse.json(mobilePushTokenResponseSchema.parse(payload));
}
