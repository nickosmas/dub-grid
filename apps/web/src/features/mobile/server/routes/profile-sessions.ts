import { NextResponse, type NextRequest } from "next/server";
import {
  mobileProfileSessionRevokeBodySchema,
  mobileProfileSessionRevokeResponseSchema,
  mobileProfileSessionsResponseSchema,
} from "@dubgrid/contracts";
import {
  fetchUserSessionOverviewForUser,
  revokeUserSessionForUser,
} from "@/features/account/server";
import { requireMobileAuth, requireMobileSensitiveActionAuth } from "@/features/mobile/server";

function mapSession(
  session: Awaited<ReturnType<typeof fetchUserSessionOverviewForUser>>["active"][number],
  currentSupabaseSessionId: string | undefined,
) {
  return {
    id: session.id,
    platform: session.platform,
    appVersion: session.appVersion,
    deviceLabel: session.deviceLabel,
    browserName: session.browserName,
    browserVersion: session.browserVersion,
    ipAddress: session.ipAddress,
    locationCity: session.locationCity,
    locationCountry: session.locationCountry,
    lastActiveAt: session.lastActiveAt,
    createdAt: session.createdAt,
    refreshTokenHash: session.refreshTokenHash,
    isCurrent:
      currentSupabaseSessionId != null && session.supabaseSessionId === currentSupabaseSessionId,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const currentSupabaseSessionId = auth.claims.session_id;
  const overview = await fetchUserSessionOverviewForUser(auth.user.id, {
    currentSupabaseSessionId:
      typeof currentSupabaseSessionId === "string" ? currentSupabaseSessionId : null,
  });

  return NextResponse.json(
    mobileProfileSessionsResponseSchema.parse({
      active: overview.active.map((session) => mapSession(session, currentSupabaseSessionId)),
      stale: overview.stale.map((session) => mapSession(session, currentSupabaseSessionId)),
    }),
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await requireMobileSensitiveActionAuth(req);
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
  return NextResponse.json(mobileProfileSessionRevokeResponseSchema.parse({ success: true }));
}
