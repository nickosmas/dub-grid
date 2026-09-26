import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

/** The web device id: HTTP-only, so page scripts never see it. */
export const DEVICE_COOKIE_NAME = "dg_device";

/**
 * The longest lifetime browsers honour (Chrome caps cookies at 400 days). It
 * is set again on every sign-in, so a browser in use keeps its id.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A device id this server issued, or null for anything else. */
export function readDeviceId(value: string | null | undefined): string | null {
  return value && DEVICE_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function issueDeviceId(): string {
  return randomUUID();
}

function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

/**
 * Records a sign-in from this device and reports whether the user had never
 * signed in from it before. A lookup that fails counts as a new device: an
 * extra alert is the safer mistake, and it is what every sign-in did before.
 */
export async function rememberSignInDevice(input: {
  userId: string;
  deviceId: string;
  platform: "web" | "ios" | "android";
}): Promise<boolean> {
  const deviceHash = hashDeviceId(input.deviceId);
  const now = new Date().toISOString();
  try {
    const service = getServiceClient();
    const { data: inserted, error } = await service
      .from("user_known_devices")
      .upsert(
        {
          user_id: input.userId,
          device_hash: deviceHash,
          platform: input.platform,
          first_seen_at: now,
          last_seen_at: now,
        },
        { onConflict: "user_id,device_hash", ignoreDuplicates: true },
      )
      .select("user_id");
    if (error) throw error;
    if ((inserted ?? []).length > 0) return true;

    const { error: touchError } = await service
      .from("user_known_devices")
      .update({ last_seen_at: now })
      .eq("user_id", input.userId)
      .eq("device_hash", deviceHash);
    if (touchError) {
      logger.warn({ err: touchError, userId: input.userId }, "known device touch failed");
    }
    return false;
  } catch (err) {
    logger.warn({ err, userId: input.userId }, "known device lookup failed");
    return true;
  }
}
