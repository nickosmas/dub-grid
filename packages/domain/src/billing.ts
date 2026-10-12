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

/** The stored status for a trial a Gridmaster ended with no grace period. */
export const TRIAL_EXPIRED_STATUS = "trial_expired";

const LOCKED_STATUSES = new Set(["canceled", "incomplete_expired", "unpaid"]);

const PAYMENT_ATTENTION_STATUSES = new Set(["incomplete", "past_due", "paused"]);

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

export function evaluateOrganizationBillingAccess(input: BillingAccessInput): BillingAccessResult {
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

  // Stored only by a Gridmaster expiring a trial early; Stripe never sends it.
  if (status === TRIAL_EXPIRED_STATUS) {
    return {
      state: "locked",
      reason: "trial_expired",
      isLocked: true,
      shouldNotifyAdmins: true,
      daysUntilTrialEnd: trialEndsAt ? daysUntil(now, trialEndsAt) : null,
      trialGraceEndsAt: null,
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

/**
 * The status to show for an organization. Stripe leaves a lapsed trial on
 * `trialing`, so a trial whose end date has passed reads as its grace period
 * or as expired, and one whose clock has not started reads as pending.
 */
export function effectiveBillingStatus(
  status: string | null | undefined,
  trialEndsAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const stored = status ?? null;
  if (stored !== null && stored !== "trialing") return stored;
  if (!trialEndsAt) return stored === "trialing" ? "trial_pending" : null;

  const { reason } = evaluateOrganizationBillingAccess({
    subscriptionStatus: stored,
    trialEndsAt,
    now,
  });
  if (reason === "trial_grace") return "trial_grace";
  if (reason === "trial_expired") return "trial_expired";
  return "trialing";
}

export interface TrialControlInput {
  status: string | null | undefined;
  trialEndsAt: string | null | undefined;
  hasStripeSubscription: boolean;
  now?: Date;
}

export interface TrialControls {
  /** Set the days left, which also reopens an ended or expired trial. */
  change: boolean;
  /** End the trial now; the grace period still applies. */
  end: boolean;
  /** Lock the organization now with no grace period. */
  expire: boolean;
  /** Why the controls are off, when none of them apply. */
  reason: string | null;
}

/**
 * Which trial actions a Gridmaster may take. The server enforces the same
 * answer, so a paying organization can never be put back on a trial and an
 * organization billed through Stripe never has its trial ended from here.
 */
export function trialControls(input: TrialControlInput): TrialControls {
  const status = input.status ?? null;
  if (status !== null && status !== "trialing" && status !== TRIAL_EXPIRED_STATUS) {
    return {
      change: false,
      end: false,
      expire: false,
      reason: "This organization isn't on a trial.",
    };
  }
  if (status === TRIAL_EXPIRED_STATUS) {
    return { change: true, end: false, expire: false, reason: null };
  }
  if (input.hasStripeSubscription) {
    return {
      change: true,
      end: false,
      expire: false,
      reason: "Stripe bills this trial. Cancel the subscription to end it.",
    };
  }
  const now = input.now ?? new Date();
  const endsAt = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : null;
  const running = endsAt === null || endsAt > now.getTime();
  return { change: true, end: running, expire: true, reason: null };
}
