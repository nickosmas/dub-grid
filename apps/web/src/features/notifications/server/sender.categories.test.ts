import { describe, expect, it } from "vitest";
import { NOTIFICATION_CATEGORIES } from "./sender";

// The platform / gridmaster org-lifecycle notification types are written directly
// by the notify_gridmasters_of_org_event DB trigger with category = 'platform'.
// This keeps the TS category map in parity so any sendNotification() call with one
// of these types lands in the same "platform" bucket the inbox filter expects.
describe("NOTIFICATION_CATEGORIES — platform / gridmaster types", () => {
  const platformTypes = [
    "org_created",
    "org_trial_started",
    "org_archived",
    "org_restored",
    "org_subscription_converted",
    "org_subscription_canceled",
    "org_payment_failed",
  ] as const;

  it.each(platformTypes)("maps %s to the platform category", (type) => {
    expect(NOTIFICATION_CATEGORIES[type]).toBe("platform");
  });
});
