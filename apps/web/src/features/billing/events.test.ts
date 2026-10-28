import { describe, expect, it } from "vitest";
import type { BillingOperationSummary } from "@/types";
import { describeBillingEvent } from "./events";

function operation(action: string, details: Record<string, unknown> = {}): BillingOperationSummary {
  return {
    id: "1",
    action,
    label: "Label",
    actorLabel: "Payment provider",
    resourceType: "billing",
    resourceId: null,
    details,
    createdAt: "2026-10-01T17:00:00Z",
  };
}

describe("describeBillingEvent", () => {
  it("shows a payment with its amount", () => {
    expect(
      describeBillingEvent(
        operation("billing.payment_succeeded", { amount_paid: 45000, currency: "usd" }),
      ),
    ).toEqual({
      category: "payments",
      title: "Payment received.",
      detail: "The monthly payment for your paid seats was collected.",
      amount: "$450.00",
      tone: "success",
      icon: "receipt",
    });
  });

  it("says how paid seats changed", () => {
    expect(
      describeBillingEvent(
        operation("billing.subscription_updated", { quantity: 30, previous_quantity: 28 }),
      ),
    ).toMatchObject({
      title: "Paid seats changed from 28 to 30.",
      detail: "Your subscription now charges for 30 seats each month.",
    });
  });

  it("files trial changes under the trial", () => {
    expect(describeBillingEvent(operation("billing.trial_expired")).category).toBe("trial");
    expect(
      describeBillingEvent(operation("billing.grace_extended", { grace_days: 1 })).detail,
    ).toBe("The grace period after the trial is now 1 day.");
  });
});
