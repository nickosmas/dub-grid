import { describe, expect, it } from "vitest";
import {
  evaluateBillingAccessWithPolicy,
  BILLING_POLICY_OVERRIDE_COLUMNS,
  BILLING_POLICY_OVERRIDE_SELECT,
  DEFAULT_BILLING_POLICY,
  billingPolicyOverridesFromRow,
  resolveBillingPolicy,
} from "./billing-policy";

const platform = { trialDays: 21, trialGraceDays: 5, trialReminderDays: 10, paymentGraceDays: 7 };

describe("resolveBillingPolicy", () => {
  it("uses the platform defaults when the organization has no overrides", () => {
    expect(resolveBillingPolicy(platform, {})).toEqual({
      values: platform,
      sources: {
        trialDays: "platform",
        trialGraceDays: "platform",
        trialReminderDays: "platform",
        paymentGraceDays: "platform",
      },
    });
  });

  it("lets an organization's override win, including zero", () => {
    const resolved = resolveBillingPolicy(platform, { trialGraceDays: 0, trialDays: null });
    expect(resolved.values).toEqual({ ...platform, trialGraceDays: 0 });
    expect(resolved.sources.trialGraceDays).toBe("organization");
    expect(resolved.sources.trialDays).toBe("platform");
  });

  it("falls back to the built-in defaults without a platform row", () => {
    expect(resolveBillingPolicy(null, null).values).toEqual(DEFAULT_BILLING_POLICY);
    expect(DEFAULT_BILLING_POLICY).toEqual({
      trialDays: 14,
      trialGraceDays: 3,
      trialReminderDays: 7,
      paymentGraceDays: 14,
    });
  });
});

describe("billingPolicyOverridesFromRow", () => {
  it("reads only numeric override columns", () => {
    expect(
      billingPolicyOverridesFromRow({
        trial_grace_days_override: 10,
        trial_length_days_override: null,
        unrelated: 4,
      }),
    ).toEqual({
      trialDays: null,
      trialGraceDays: 10,
      trialReminderDays: null,
      paymentGraceDays: null,
    });
  });
});

describe("BILLING_POLICY_OVERRIDE_SELECT", () => {
  it("lists every override column", () => {
    expect(BILLING_POLICY_OVERRIDE_SELECT.split(", ")).toEqual(
      Object.values(BILLING_POLICY_OVERRIDE_COLUMNS),
    );
  });
});

describe("evaluateBillingAccessWithPolicy", () => {
  it("applies the organization's payment grace", () => {
    const input = {
      subscriptionStatus: "past_due",
      paymentGraceStartedAt: "2026-10-01T00:00:00Z",
      now: new Date("2026-10-20T00:00:00Z"),
    };
    expect(evaluateBillingAccessWithPolicy(input, DEFAULT_BILLING_POLICY, {}).isLocked).toBe(true);
    expect(
      evaluateBillingAccessWithPolicy(input, DEFAULT_BILLING_POLICY, { paymentGraceDays: 30 })
        .isLocked,
    ).toBe(false);
  });
});
