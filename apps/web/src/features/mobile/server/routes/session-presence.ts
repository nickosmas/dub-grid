import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { trackUserSessionForUser } from "@/features/account/server";
import { requireMobileAuth } from "@/features/mobile/server";
import logger from "@/lib/logger";
import { createMobileOptionsHandler, withMobileCors } from "./cors";
import { getSessionLocation } from "@/features/account/server/session-location";
import { claimNewSignIn, scheduleSecurityAlert } from "@/features/account/server/security-alerts";
import {
  issueDeviceId,
  readDeviceId,
  rememberSignInDevice,
} from "@/features/account/server/known-devices";

const CORS_METHODS = ["POST", "OPTIONS"] as const;

const mobileSessionPresenceBodySchema = z.object({
  platform: z.enum(["ios", "android"]),
  deviceLabel: z.string().min(1),
  appVersion: z.string().min(1).optional(),
  // Issued by this route and kept in the app's secure storage. Older app
  // versions send none, and every sign-in from them still alerts.
  deviceId: z.string().optional(),
});

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function POST(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);

  const auth = await requireMobileAuth(req);
  if ("response" in auth) {
    return withMobileCors(req, auth.response, CORS_METHODS);
  }

  const supabaseSessionId =
    typeof auth.claims.session_id === "string" ? auth.claims.session_id : null;
  if (!supabaseSessionId) {
    return json({ error: "Missing session id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "We couldn't read that request. Try again." }, { status: 400 });
  }

  const parsed = mobileSessionPresenceBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Check the request details and try again." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const location = getSessionLocation(req.headers);
  const deviceId = readDeviceId(parsed.data.deviceId) ?? issueDeviceId();
  // A new session from an install this user has signed in from before is quiet.
  const isNewDevice = () =>
    rememberSignInDevice({ userId: auth.user.id, deviceId, platform: parsed.data.platform });

  // Before the upsert, which fills in the platform this claim keys on. A
  // claimed row alerts at once, since a failed upsert's retry would find the
  // claim spent; a session with no row yet alerts only once its row lands.
  const claim = await claimNewSignIn({
    userId: auth.user.id,
    supabaseSessionId,
    platform: parsed.data.platform,
    claims: auth.claims,
  });

  const alertNewSignIn = () =>
    scheduleSecurityAlert(auth.user.id, {
      action: "security_new_device",
      orgId: auth.currentOrg.id,
      targetUserId: auth.user.id,
      supabaseSessionId,
      platform: parsed.data.platform,
      deviceLabel: parsed.data.deviceLabel,
      ipAddress: ip,
      locationCity: location.city,
      locationCountry: location.country,
      occurredAt: new Date().toISOString(),
    });
  if (claim === "claimed" && (await isNewDevice())) alertNewSignIn();

  try {
    await trackUserSessionForUser({
      userId: auth.user.id,
      orgId: auth.currentOrg.id,
      supabaseSessionId,
      platform: parsed.data.platform,
      deviceLabel: parsed.data.deviceLabel,
      appVersion: parsed.data.appVersion ?? null,
      ipAddress: ip,
      locationCity: location.city,
      locationCountry: location.country,
    });
  } catch (error) {
    logger.error({ error }, "mobile session-presence upsert failed");
    return json({ error: "We couldn't record this device. Try again." }, { status: 500 });
  }

  // After the upsert, so a failed one's retry still finds the device new.
  if (claim === "unrecorded" && (await isNewDevice())) alertNewSignIn();

  return json({ success: true, deviceId });
}
