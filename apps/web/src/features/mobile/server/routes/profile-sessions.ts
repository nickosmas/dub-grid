import { NextResponse, type NextRequest } from "next/server";
import {
  mobileProfileSessionRevokeBodySchema,
  mobileProfileSessionRevokeResponseSchema,
  mobileProfileSessionsResponseSchema,
} from "@dubgrid/contracts";
import {
  fetchActiveUserSessionsForUser,
  revokeUserSessionForUser,
} from "@/features/account/server";
import { requireMobileAuth } from "@/features/mobile/server";

function mapSession(session: Awaited<ReturnType<typeof fetchActiveUserSessionsForUser>>[number]) {
  return {
    id: session.id,
    platform: session.platform,
    appVersion: session.appVersion,
    deviceLabel: session.deviceLabel,
    ipAddress: session.ipAddress,
    lastActiveAt: session.lastActiveAt,
    createdAt: session.createdAt,
    refreshTokenHash: session.refreshTokenHash,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const sessions = await fetchActiveUserSessionsForUser(auth.user.id);

  return NextResponse.json(
    mobileProfileSessionsResponseSchema.parse({
      sessions: sessions.map(mapSession),
    }),
  );
}

export async function DELETE(req: NextRequest) {
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

  const parsed = mobileProfileSessionRevokeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  await revokeUserSessionForUser(auth.user.id, parsed.data.refreshTokenHash);
  return NextResponse.json(
    mobileProfileSessionRevokeResponseSchema.parse({ success: true }),
  );
}
