import { describe, expect, it } from "vitest";
import { ALERT_TYPES_WITHOUT_DESTINATION, resolveAlertDestination } from "@dubgrid/domain";
import { NOTIFICATION_CATEGORIES } from "@/features/notifications/server/sender";

// The routes and query parameters 39b makes real. A destination outside this
// set would send a reader somewhere the app cannot land.
const LOCKED_ROUTES =
  /^\/(schedule|people|profile|settings)(\/[0-9a-f-]{36})?(\?(date|requests|section)=[a-z0-9-]+)?$/;

const PLATFORM_ONLY = [
  "org_created",
  "org_trial_started",
  "org_archived",
  "org_restored",
  "org_subscription_converted",
  "org_subscription_canceled",
  "org_payment_failed",
];

// Every type the app can write, from the runtime category map the sender keeps.
const PRODUCED_TYPES = Object.keys(NOTIFICATION_CATEGORIES);

describe("every produced alert type has a destination decision", () => {
  it("covers a realistic number of types", () => {
    expect(PRODUCED_TYPES.length).toBeGreaterThan(40);
  });

  it("names exactly the gridmaster platform rows as having no destination", () => {
    expect([...ALERT_TYPES_WITHOUT_DESTINATION].sort()).toEqual([...PLATFORM_ONLY].sort());
    for (const type of PLATFORM_ONLY) {
      expect(NOTIFICATION_CATEGORIES[type], type).toBe("platform");
    }
  });

  for (const type of PRODUCED_TYPES) {
    it(`decides "${type}"`, () => {
      const destination = resolveAlertDestination({ type, metadata: {} });
      if (ALERT_TYPES_WITHOUT_DESTINATION.has(type)) {
        expect(destination).toBeNull();
        return;
      }
      expect(destination, `${type} resolves to nothing`).not.toBeNull();
      expect(destination?.href).toMatch(LOCKED_ROUTES);
      expect(destination?.label.trim().length).toBeGreaterThan(0);
    });
  }

  it("keeps parameterized destinations inside the locked routes", () => {
    const withDetail = [
      resolveAlertDestination({ type: "shift_request_new", metadata: { tab: "approval" } }),
      resolveAlertDestination({
        type: "schedule_published",
        metadata: { startDate: "2026-09-21" },
      }),
      resolveAlertDestination({
        type: "employee_created",
        metadata: { empId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" },
      }),
    ];
    for (const destination of withDetail) {
      expect(destination?.href).toMatch(LOCKED_ROUTES);
    }
  });
});
