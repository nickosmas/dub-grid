import { NextResponse, type NextRequest } from "next/server";
import {
  mobileNotificationPreferencesResponseSchema,
  mobileNotificationPreferencesUpdateBodySchema,
  type MobileNotificationPreferences,
} from "@dubgrid/contracts";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from "@/features/account/server";
import { requireMobileAuth } from "@/features/mobile/server";

const DEFAULT_PREFS: MobileNotificationPreferences = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
};

function normalizeMobileNotificationPreferences(
  prefs: Record<string, { in_app?: boolean; email?: boolean }> | null,
): MobileNotificationPreferences {
  return {
    schedule: {
      in_app: prefs?.schedule?.in_app ?? DEFAULT_PREFS.schedule.in_app,
      email: prefs?.schedule?.email ?? DEFAULT_PREFS.schedule.email,
    },
    shift_requests: {
      in_app: prefs?.shift_requests?.in_app ?? DEFAULT_PREFS.shift_requests.in_app,
      email: prefs?.shift_requests?.email ?? DEFAULT_PREFS.shift_requests.email,
    },
    system: {
      in_app: prefs?.system?.in_app ?? DEFAULT_PREFS.system.in_app,
      email: prefs?.system?.email ?? DEFAULT_PREFS.system.email,
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const prefs = await fetchNotificationPreferences(auth.user.id);

  return NextResponse.json(
    mobileNotificationPreferencesResponseSchema.parse({
      prefs: normalizeMobileNotificationPreferences(prefs),
    }),
  );
}

export async function PUT(req: NextRequest) {
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

  const parsed = mobileNotificationPreferencesUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the notification settings and try again." },
      { status: 400 },
    );
  }

  const prefs = await saveNotificationPreferences(auth.user.id, parsed.data.prefs);

  return NextResponse.json(
    mobileNotificationPreferencesResponseSchema.parse({
      prefs: normalizeMobileNotificationPreferences(prefs),
    }),
  );
}
