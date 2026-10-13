import {
  DEFAULT_TRIAL_DAYS,
  PAYMENT_GRACE_DAYS,
  TRIAL_ADMIN_NOTICE_DAYS,
  TRIAL_GRACE_DAYS,
  evaluateOrganizationBillingAccess,
  type BillingAccessInput,
  type BillingAccessResult,
} from "./billing";

/** How long trials last and how long an organization stays open past a deadline. */
export interface BillingPolicy {
  trialDays: number;
  /** Days an organization stays open after its trial ends. */
  trialGraceDays: number;
  /** Days before the trial ends that admins are reminded. */
  trialReminderDays: number;
  /** Days a past-due subscription stays open (applied from 44f). */
  paymentGraceDays: number;
}

export type BillingPolicyKey = keyof BillingPolicy;

export const BILLING_POLICY_KEYS: readonly BillingPolicyKey[] = [
  "trialDays",
  "trialGraceDays",
  "trialReminderDays",
  "paymentGraceDays",
];

export const DEFAULT_BILLING_POLICY: BillingPolicy = {
  trialDays: DEFAULT_TRIAL_DAYS,
  trialGraceDays: TRIAL_GRACE_DAYS,
  trialReminderDays: TRIAL_ADMIN_NOTICE_DAYS,
  paymentGraceDays: PAYMENT_GRACE_DAYS,
};

/** The ranges the database enforces; the forms use the same ones. */
export const BILLING_POLICY_LIMITS: Record<BillingPolicyKey, { min: number; max: number }> = {
  trialDays: { min: 1, max: 365 },
  trialGraceDays: { min: 0, max: 90 },
  trialReminderDays: { min: 0, max: 90 },
  paymentGraceDays: { min: 0, max: 90 },
};

export type BillingPolicyOverrides = Partial<Record<BillingPolicyKey, number | null>>;

export type BillingPolicySource = "platform" | "organization";

export interface ResolvedBillingPolicy {
  values: BillingPolicy;
  sources: Record<BillingPolicyKey, BillingPolicySource>;
}

/**
 * An organization's effective policy: its own override where it has one,
 * otherwise the platform default, otherwise the built-in default.
 */
export function resolveBillingPolicy(
  platform: BillingPolicy | null | undefined,
  overrides: BillingPolicyOverrides | null | undefined,
): ResolvedBillingPolicy {
  const base = platform ?? DEFAULT_BILLING_POLICY;
  const values = { ...base };
  const sources = {} as Record<BillingPolicyKey, BillingPolicySource>;
  for (const key of BILLING_POLICY_KEYS) {
    const override = overrides?.[key];
    if (typeof override === "number") {
      values[key] = override;
      sources[key] = "organization";
    } else {
      sources[key] = "platform";
    }
  }
  return { values, sources };
}

/** Override columns on `organizations`, by policy key. */
export const BILLING_POLICY_OVERRIDE_COLUMNS: Record<BillingPolicyKey, string> = {
  trialDays: "trial_length_days_override",
  trialGraceDays: "trial_grace_days_override",
  trialReminderDays: "trial_reminder_days_override",
  paymentGraceDays: "payment_grace_days_override",
};

/** The override columns, for any select that decides billing access. */
export const BILLING_POLICY_OVERRIDE_SELECT =
  "trial_length_days_override, trial_grace_days_override, trial_reminder_days_override, payment_grace_days_override";

/** The override columns plus the billing hold: every select that decides access. */
export const BILLING_ACCESS_SELECT =
  "trial_length_days_override, trial_grace_days_override, trial_reminder_days_override, payment_grace_days_override, billing_paused_at, payment_grace_started_at";

/** Billing access with an organization's effective policy applied. */
export function evaluateBillingAccessWithPolicy(
  input: Omit<BillingAccessInput, "trialGraceDays" | "trialAdminNoticeDays" | "paymentGraceDays">,
  platform: BillingPolicy | null | undefined,
  overrides: BillingPolicyOverrides | null | undefined,
): BillingAccessResult {
  const { values } = resolveBillingPolicy(platform, overrides);
  return evaluateOrganizationBillingAccess({
    ...input,
    trialGraceDays: values.trialGraceDays,
    trialAdminNoticeDays: values.trialReminderDays,
    paymentGraceDays: values.paymentGraceDays,
  });
}

/** Reads an organization row's override columns into policy overrides. */
export function billingPolicyOverridesFromRow(
  row: Record<string, unknown> | null | undefined,
): BillingPolicyOverrides {
  const overrides: BillingPolicyOverrides = {};
  for (const key of BILLING_POLICY_KEYS) {
    const value = row?.[BILLING_POLICY_OVERRIDE_COLUMNS[key]];
    overrides[key] = typeof value === "number" ? value : null;
  }
  return overrides;
}
