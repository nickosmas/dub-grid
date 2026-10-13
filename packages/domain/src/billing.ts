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
  | "suspended"
  | "paused";

export type BillingAccessReason =
  | "active_subscription"
  | "trial_not_started"
  | "trial_active"
  | "trial_ending_soon"
  | "trial_grace"
  | "trial_expired"
  | "payment_status"
  | "suspended"
  | "billing_paused";

export interface BillingAccessInput {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  suspendedAt?: string | null;
  /** Set while a Gridmaster holds the organization's billing; see `paused`. */
  billingPausedAt?: string | null;
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

const ENDED_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Whether a Stripe subscription still exists to manage. An ended one can't be
 * revived from Stripe's billing portal, so the organization subscribes anew.
 */
export function isLiveSubscriptionStatus(status: string | null | undefined): boolean {
  return Boolean(status) && !ENDED_SUBSCRIPTION_STATUSES.has(status as string);
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

  // A hold keeps access open and stops the trial clock, so the days left stay
  // where they were at the pause. It never reopens a hard-locked organization.
  const pausedAt = parseDate(input.billingPausedAt);
  if (pausedAt) {
    return {
      state: "paused",
      reason: "billing_paused",
      isLocked: false,
      shouldNotifyAdmins: false,
      daysUntilTrialEnd: trialEndsAt ? daysUntil(pausedAt, trialEndsAt) : null,
      trialGraceEndsAt: null,
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
  trialGraceDays?: number,
): string | null {
  const stored = status ?? null;
  if (stored !== null && stored !== "trialing") return stored;
  if (!trialEndsAt) return stored === "trialing" ? "trial_pending" : null;

  const { reason } = evaluateOrganizationBillingAccess({
    subscriptionStatus: stored,
    trialEndsAt,
    now,
    trialGraceDays,
  });
  if (reason === "trial_grace") return "trial_grace";
  if (reason === "trial_expired") return "trial_expired";
  return "trialing";
}

/** The display status for a held organization that isn't otherwise locked. */
export const BILLING_PAUSED_STATUS = "billing_paused";

/**
 * `effectiveBillingStatus` with the billing hold applied: a paused organization
 * reads as paused unless its status locks it anyway.
 */
export function displayBillingStatus(
  status: string | null | undefined,
  trialEndsAt: string | null | undefined,
  options: { now?: Date; trialGraceDays?: number; billingPausedAt?: string | null } = {},
): string | null {
  const stored = status ?? null;
  const hardLocked =
    stored !== null && (LOCKED_STATUSES.has(stored) || stored === TRIAL_EXPIRED_STATUS);
  if (options.billingPausedAt && !hardLocked) return BILLING_PAUSED_STATUS;
  return effectiveBillingStatus(stored, trialEndsAt, options.now, options.trialGraceDays);
}

export interface TrialControlInput {
  status: string | null | undefined;
  trialEndsAt: string | null | undefined;
  hasStripeSubscription: boolean;
  /** A paused organization's trial isn't running, so it can't be changed. */
  billingPausedAt?: string | null;
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
  if (input.billingPausedAt) {
    return {
      change: false,
      end: false,
      expire: false,
      reason: "Billing is paused. Resume it to change the trial.",
    };
  }
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

export interface BillingActionGate {
  allowed: boolean;
  /** Why the action is off; null when it applies. */
  reason: string | null;
}

export interface BillingHoldInput {
  status: string | null | undefined;
  trialEndsAt: string | null | undefined;
  suspendedAt?: string | null;
  billingPausedAt?: string | null;
  trialGraceDays?: number;
  now?: Date;
}

export interface BillingHoldControls {
  pause: BillingActionGate;
  resume: BillingActionGate;
  extendGrace: BillingActionGate;
}

function gate(reason: string | null): BillingActionGate {
  return { allowed: reason === null, reason };
}

/**
 * Which hold and grace actions a Gridmaster may take. The server enforces the
 * same answer. A pause keeps access open, so it only applies to an
 * organization that is open now; grace only extends a trial that has ended.
 */
export function billingHoldControls(input: BillingHoldInput): BillingHoldControls {
  const now = input.now ?? new Date();
  const status = input.status ?? null;
  const paused = Boolean(input.billingPausedAt);
  const access = evaluateOrganizationBillingAccess({
    subscriptionStatus: status,
    trialEndsAt: input.trialEndsAt,
    suspendedAt: input.suspendedAt,
    trialGraceDays: input.trialGraceDays,
    now,
  });

  const pauseReason = paused
    ? "Billing is already paused."
    : access.state === "suspended"
      ? "This organization is suspended."
      : access.isLocked
        ? "This organization is locked. Reopen it before pausing billing."
        : null;

  const trialEndsAt = input.trialEndsAt ? Date.parse(input.trialEndsAt) : null;
  const graceReason = paused
    ? "Billing is paused, so the trial isn't counting down."
    : input.suspendedAt
      ? "This organization is suspended."
      : status === TRIAL_EXPIRED_STATUS
        ? "The trial was expired with no grace period. Change the trial to reopen it."
        : status !== null && status !== "trialing"
          ? "This organization isn't on a trial."
          : trialEndsAt === null || trialEndsAt > now.getTime()
            ? "The trial hasn't ended yet."
            : null;

  return {
    pause: gate(pauseReason),
    resume: gate(paused ? null : "Billing isn't paused."),
    extendGrace: gate(graceReason),
  };
}

export interface ResumeTrialInput {
  status: string | null | undefined;
  trialEndsAt: string | null | undefined;
  trialStartedAt: string | null | undefined;
  billingPausedAt: string;
  now?: Date;
}

/**
 * The trial end after a resume, moved later by the time the trial spent
 * paused, or null when there is no trial to move. A trial that started during
 * the pause only gives back the time since it started.
 */
export function resumedTrialEndsAt(input: ResumeTrialInput): string | null {
  const status = input.status ?? null;
  if (status !== null && status !== "trialing") return null;
  const trialEndsAt = parseDate(input.trialEndsAt);
  const pausedAt = parseDate(input.billingPausedAt);
  if (!trialEndsAt || !pausedAt) return null;
  const startedAt = parseDate(input.trialStartedAt);
  const heldFrom = startedAt && startedAt > pausedAt ? startedAt : pausedAt;
  const now = input.now ?? new Date();
  const held = Math.max(0, now.getTime() - heldFrom.getTime());
  return new Date(trialEndsAt.getTime() + held).toISOString();
}
