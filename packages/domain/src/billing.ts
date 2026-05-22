export const TRIAL_ADMIN_NOTICE_DAYS = 7;
export const TRIAL_GRACE_DAYS = 3;
export const DEFAULT_TRIAL_DAYS = 14;

export type BillingAccessState =
  | "active"
  | "trial_pending"
  | "trialing"
  | "trial_ending_soon"
  | "trial_grace"
  | "payment_attention_required"
  | "locked"
  | "suspended";

export type BillingAccessReason =
  | "active_subscription"
  | "trial_not_started"
  | "trial_active"
  | "trial_ending_soon"
  | "trial_grace"
  | "trial_expired"
  | "payment_status"
  | "suspended";

export interface BillingAccessInput {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  suspendedAt?: string | null;
  now?: Date;
  trialGraceDays?: number;
  trialAdminNoticeDays?: number;
}

export interface BillingAccessResult {
  state: BillingAccessState;
  reason: BillingAccessReason;
  isLocked: boolean;
  shouldNotifyAdmins: boolean;
  daysUntilTrialEnd: number | null;
  trialGraceEndsAt: string | null;
}

const LOCKED_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
  "unpaid",
]);

const PAYMENT_ATTENTION_STATUSES = new Set([
  "incomplete",
  "past_due",
  "paused",
]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysUntil(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

export function evaluateOrganizationBillingAccess(
  input: BillingAccessInput,
): BillingAccessResult {
  const now = input.now ?? new Date();
  const status = input.subscriptionStatus ?? null;
  const trialEndsAt = parseDate(input.trialEndsAt);
  const graceDays = input.trialGraceDays ?? TRIAL_GRACE_DAYS;
  const noticeDays = input.trialAdminNoticeDays ?? TRIAL_ADMIN_NOTICE_DAYS;

  if (input.suspendedAt) {
    return {
      state: "suspended",
      reason: "suspended",
      isLocked: true,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: trialEndsAt ? daysUntil(now, trialEndsAt) : null,
      trialGraceEndsAt: trialEndsAt ? addDays(trialEndsAt, graceDays).toISOString() : null,
    };
  }

  if (status && LOCKED_STATUSES.has(status)) {
    return {
      state: "locked",
      reason: "payment_status",
      isLocked: true,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: trialEndsAt ? daysUntil(now, trialEndsAt) : null,
      trialGraceEndsAt: trialEndsAt ? addDays(trialEndsAt, graceDays).toISOString() : null,
    };
  }

  if (status === "active") {
    return {
      state: "active",
      reason: "active_subscription",
      isLocked: false,
      shouldNotifyAdmins: false,
      daysUntilTrialEnd: null,
      trialGraceEndsAt: null,
    };
  }

  if (status && PAYMENT_ATTENTION_STATUSES.has(status)) {
    return {
      state: "payment_attention_required",
      reason: "payment_status",
      isLocked: false,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: trialEndsAt ? daysUntil(now, trialEndsAt) : null,
      trialGraceEndsAt: trialEndsAt ? addDays(trialEndsAt, graceDays).toISOString() : null,
    };
  }

  if (status === "trialing" || !status) {
    if (!trialEndsAt) {
      // Trialing with no end date = the trial clock has not started yet. It
      // starts when the first super_admin signs in (custom_access_token_hook).
      // Not locked, but non-super-admins are gated until it starts (middleware).
      return {
        state: "trial_pending",
        reason: "trial_not_started",
        isLocked: false,
        shouldNotifyAdmins: false,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      };
    }

    const trialDaysRemaining = daysUntil(now, trialEndsAt);
    if (now.getTime() < trialEndsAt.getTime()) {
      const shouldNotifyAdmins = trialDaysRemaining <= noticeDays;
      return {
        state: shouldNotifyAdmins ? "trial_ending_soon" : "trialing",
        reason: shouldNotifyAdmins ? "trial_ending_soon" : "trial_active",
        isLocked: false,
        shouldNotifyAdmins,
        daysUntilTrialEnd: trialDaysRemaining,
        trialGraceEndsAt: addDays(trialEndsAt, graceDays).toISOString(),
      };
    }

    const graceEndsAt = addDays(trialEndsAt, graceDays);
    if (now.getTime() < graceEndsAt.getTime()) {
      return {
        state: "trial_grace",
        reason: "trial_grace",
        isLocked: false,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: trialDaysRemaining,
        trialGraceEndsAt: graceEndsAt.toISOString(),
      };
    }

    return {
      state: "locked",
      reason: "trial_expired",
      isLocked: true,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: trialDaysRemaining,
      trialGraceEndsAt: graceEndsAt.toISOString(),
    };
  }

  return {
    state: "payment_attention_required",
    reason: "payment_status",
    isLocked: false,
    shouldNotifyAdmins: true,
    daysUntilTrialEnd: trialEndsAt ? daysUntil(now, trialEndsAt) : null,
    trialGraceEndsAt: trialEndsAt ? addDays(trialEndsAt, graceDays).toISOString() : null,
  };
}
