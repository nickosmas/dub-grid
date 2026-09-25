export type MobilePushPlatform = "ios" | "android";

export type MobilePushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type MobilePushToken = {
  expo_push_token: string;
};

export type MobileExpoPushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export class MobilePushDeliveryError extends Error {
  readonly status: number | null;

  constructor(message: string, status?: number | null) {
    super(message);
    this.name = "MobilePushDeliveryError";
    this.status = status ?? null;
  }
}

const PUSH_ELIGIBLE_TYPES = new Set([
  // existing
  "schedule_published",
  "shift_request_new",
  "shift_request_approved",
  "shift_request_rejected",
  "shift_request_expired",
  // schedule (recurring/series — touch a user's assignments directly)
  "recurring_shift_updated",
  "shift_series_updated",
  // membership — user is removed or has their role/perms changed
  "membership_removed",
  // employee — user's own status changes (archived/restored)
  "employee_status_changed",
  // org-level — critical org state
  "org_suspended",
  // billing — payment failures + trial deadlines are time-sensitive
  "billing_payment_failed",
  "billing_trial_ending_soon",
  "billing_trial_expired",
  // security — always push so users notice quickly
  "security_email_changed",
  "security_password_changed",
  "security_mfa_changed",
  "security_new_device",
  "security_session_revoked",
]);

export function isPushEligibleNotificationType(type: string): boolean {
  return PUSH_ELIGIBLE_TYPES.has(type);
}

/**
 * Security alerts are about the sign-in, not one organization, so they go to
 * every device the account registered, whichever organization it registered
 * under, and even when the event has no organization at all.
 */
export function isAccountWidePushType(type: string): boolean {
  return type.startsWith("security_");
}

export async function deliverMobilePushNotifications(
  input: {
    userId: string;
    orgId: string | null;
    payload: MobilePushPayload;
    accountWide?: boolean;
  },
  deps: {
    /** A null `orgId` reads the user's tokens across every organization. */
    fetchPushTokens: (input: {
      userId: string;
      orgId: string | null;
    }) => Promise<MobilePushToken[]>;
    sendMessages: (
      messages: MobileExpoPushMessage[],
    ) => Promise<{ ok: boolean; status?: number | null }>;
  },
): Promise<void> {
  if (!input.accountWide && !input.orgId) {
    return;
  }

  const rows = await deps.fetchPushTokens({
    userId: input.userId,
    orgId: input.accountWide ? null : input.orgId,
  });
  // Defensive: a token is unique today, but a repeat would mean a double alert.
  const tokens = [...new Set(rows.map((row) => row.expo_push_token))];
  if (tokens.length === 0) {
    return;
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default" as const,
    title: input.payload.title,
    body: input.payload.body,
    data: input.payload.data ?? {},
  }));

  const result = await deps.sendMessages(messages);
  if (!result.ok) {
    throw new MobilePushDeliveryError("Expo push delivery failed", result.status);
  }
}
