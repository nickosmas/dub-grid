import { describe, expect, it } from "vitest";
import { loadOrganizationBillingSummary } from "./server";

// Sandbox orgs no longer get a synthetic billing summary — billing surfaces the
// real source org's data (the route resolves it with ignoreSandbox). So this
// exercises the real mapping for a normal organization: org row + subscription
// + billable app-user count + recent billing audit-log operations.
function createQueryClient() {
  return {
    from(table: string) {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "org-1",
                  name: "Acme Health",
                  slug: "acme",
                  workspace_kind: "real",
                  stripe_customer_id: "cus_123",
                  subscription_status: "active",
                  trial_ends_at: null,
                  subscription_seats: 5,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  stripe_subscription_id: "sub_123",
                  stripe_customer_id: "cus_123",
                  status: "active",
                  quantity: 5,
                  current_period_end: "2026-06-01T00:00:00Z",
                  cancel_at: null,
                  canceled_at: null,
                  trial_end: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "employees") {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({
                data: [
                  { id: 1, user_id: "linked-user" },
                  { id: 2, user_id: null },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "organization_memberships") {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({
                data: [{ user_id: "linked-user" }, { user_id: "manager-user" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "audit_log") {
        return {
          select: () => ({
            eq: () => ({
              like: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 1,
                        action: "billing.subscription_created",
                        created_at: "2026-05-03T00:00:00Z",
                      },
                      { id: 2, action: "billing.seats_synced", created_at: "2026-05-02T00:00:00Z" },
                      {
                        id: 3,
                        action: "billing.portal_opened",
                        created_at: "2026-05-01T00:00:00Z",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("loadOrganizationBillingSummary", () => {
  it("maps the org, subscription, app-user count, and recent operations", async () => {
    const summary = await loadOrganizationBillingSummary(
      createQueryClient() as unknown as Parameters<typeof loadOrganizationBillingSummary>[0],
      "org-1",
      {
        canManageBilling: true,
        actor: {
          id: "user-1",
          user_metadata: { full_name: "Nick Osmas" },
        },
      },
    );

    expect(summary.status).toBe("active");
    expect(summary.orgName).toBe("Acme Health");
    expect(summary.hasStripeCustomer).toBe(true);
    expect(summary.hasStripeSubscription).toBe(true);
    // appUserCount = 2 employees + 1 management-only membership (manager-user)
    expect(summary.appUserCount).toBe(3);
    expect(summary.subscriptionSeats).toBe(5);
    expect(summary.recentOperations?.map((operation) => operation.label)).toEqual([
      "Subscription started",
      "Seats synced",
      "Billing portal opened",
    ]);
  });
});
