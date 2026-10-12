import { describe, expect, it } from "vitest";
import { effectiveBillingStatus } from "./billing";

const now = new Date("2026-10-12T12:00:00Z");

describe("effectiveBillingStatus", () => {
  it("keeps a running trial as trialing", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-20T00:00:00Z", now)).toBe("trialing");
  });

  it("reads a trial past its end date as its grace period", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-10T00:00:00Z", now)).toBe("trial_grace");
  });

  it("reads a trial past its grace period as expired", () => {
    expect(effectiveBillingStatus("trialing", "2026-10-09T00:00:00Z", now)).toBe("trial_expired");
    expect(effectiveBillingStatus(null, "2026-10-01T00:00:00Z", now)).toBe("trial_expired");
  });

  it("reads a trial with no end date as pending", () => {
    expect(effectiveBillingStatus("trialing", null, now)).toBe("trial_pending");
  });

  it("leaves Stripe statuses and a missing subscription alone", () => {
    expect(effectiveBillingStatus("active", "2026-10-01T00:00:00Z", now)).toBe("active");
    expect(effectiveBillingStatus("past_due", null, now)).toBe("past_due");
    expect(effectiveBillingStatus(null, null, now)).toBeNull();
  });
});
