import {
  BILLING_ACCESS_SELECT,
  BILLING_POLICY_OVERRIDE_SELECT,
  DEFAULT_BILLING_POLICY,
  billingPolicyOverridesFromRow,
  evaluateBillingAccessWithPolicy,
  resolveBillingPolicy,
  type BillingAccessResult,
  type BillingPolicy,
  type Organization,
  type ResolvedBillingPolicy,
} from "@dubgrid/domain";
import { cacheDel, cacheThrough, CacheKey, TTL } from "@/lib/cache";
import * as Sentry from "@/lib/sentry";

type QueryClient = { from: (table: string) => any };

export { BILLING_ACCESS_SELECT, BILLING_POLICY_OVERRIDE_SELECT };

/**
 * The organization access record the proxy and access-status both cache under
 * one key; they must select the same columns or each overwrites the other.
 */
export const ORG_ACCESS_SELECT = `suspended_at, archived_at, subscription_status, trial_ends_at, ${BILLING_ACCESS_SELECT}`;

const PLATFORM_SELECT =
  "default_trial_days, trial_grace_days, trial_reminder_days, payment_grace_days, updated_at";

// The proxy reads the policy on every request, so each process keeps it for a
// few seconds before asking Redis again, as the proxy does for org access.
const MEMO_MS = 10_000;
let memo: { policy: BillingPolicy; expiresAt: number } | null = null;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function policyFromRow(row: Record<string, unknown> | null): BillingPolicy {
  if (!row) return DEFAULT_BILLING_POLICY;
  return {
    trialDays: isNumber(row.default_trial_days)
      ? row.default_trial_days
      : DEFAULT_BILLING_POLICY.trialDays,
    trialGraceDays: isNumber(row.trial_grace_days)
      ? row.trial_grace_days
      : DEFAULT_BILLING_POLICY.trialGraceDays,
    trialReminderDays: isNumber(row.trial_reminder_days)
      ? row.trial_reminder_days
      : DEFAULT_BILLING_POLICY.trialReminderDays,
    paymentGraceDays: isNumber(row.payment_grace_days)
      ? row.payment_grace_days
      : DEFAULT_BILLING_POLICY.paymentGraceDays,
  };
}

function isPolicy(value: unknown): value is BillingPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  return (
    isNumber(policy.trialDays) &&
    isNumber(policy.trialGraceDays) &&
    isNumber(policy.trialReminderDays) &&
    isNumber(policy.paymentGraceDays)
  );
}

async function readPlatformPolicy(client: QueryClient): Promise<BillingPolicy> {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select(PLATFORM_SELECT)
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return policyFromRow(data as Record<string, unknown> | null);
}

/**
 * The platform's billing defaults. Fails closed to the built-in defaults: a
 * Redis or database blip must never silently lengthen or shorten a grace
 * period, and the fallback is not cached, so the next read retries.
 */
export async function getPlatformBillingPolicy(client: QueryClient): Promise<BillingPolicy> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) return memo.policy;
  try {
    const cached = await cacheThrough(CacheKey.platformBillingPolicy(), TTL.MIDDLEWARE, () =>
      readPlatformPolicy(client),
    );
    const policy = isPolicy(cached) ? cached : DEFAULT_BILLING_POLICY;
    memo = { policy, expiresAt: now + MEMO_MS };
    return policy;
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "platform-billing-policy-read" } });
    return DEFAULT_BILLING_POLICY;
  }
}

/** An organization's effective policy, from its row's override columns. */
export async function getOrgBillingPolicy(
  client: QueryClient,
  orgRow: Record<string, unknown> | null | undefined,
): Promise<ResolvedBillingPolicy> {
  return resolveBillingPolicy(
    await getPlatformBillingPolicy(client),
    billingPolicyOverridesFromRow(orgRow),
  );
}

export interface OrgBillingRow {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  suspended_at?: string | null;
  billing_paused_at?: string | null;
  [column: string]: unknown;
}

/** Billing access for an organization row, using its effective policy. */
export async function evaluateOrgBillingAccess(
  client: QueryClient,
  org: OrgBillingRow | null | undefined,
  options: { now?: Date; subscriptionStatus?: string | null; trialEndsAt?: string | null } = {},
): Promise<BillingAccessResult> {
  return evaluateBillingAccessWithPolicy(
    {
      subscriptionStatus: options.subscriptionStatus ?? org?.subscription_status ?? null,
      trialEndsAt: options.trialEndsAt ?? org?.trial_ends_at ?? null,
      suspendedAt: org?.suspended_at ?? null,
      billingPausedAt: org?.billing_paused_at ?? null,
      now: options.now,
    },
    await getPlatformBillingPolicy(client),
    billingPolicyOverridesFromRow(org),
  );
}

/** Billing access for a mapped organization, using its effective policy. */
export async function evaluateOrganizationAccess(
  client: QueryClient,
  org: Pick<
    Organization,
    | "subscriptionStatus"
    | "trialEndsAt"
    | "suspendedAt"
    | "billingPolicyOverrides"
    | "billingPausedAt"
  >,
): Promise<BillingAccessResult> {
  return evaluateBillingAccessWithPolicy(
    {
      subscriptionStatus: org.subscriptionStatus ?? null,
      trialEndsAt: org.trialEndsAt ?? null,
      suspendedAt: org.suspendedAt ?? null,
      billingPausedAt: org.billingPausedAt ?? null,
    },
    await getPlatformBillingPolicy(client),
    org.billingPolicyOverrides,
  );
}

/** Call after a Gridmaster changes the platform defaults. */
export async function invalidatePlatformBillingPolicyCache(): Promise<void> {
  memo = null;
  await cacheDel(CacheKey.platformBillingPolicy());
}

/** Test seam: forgets the per-process memo. */
export function resetBillingPolicyMemoForTests(): void {
  memo = null;
}
