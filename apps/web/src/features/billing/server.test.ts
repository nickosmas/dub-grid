import { describe, expect, it } from "vitest";
import { loadOrganizationBillingSummary } from "./server";

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
                  workspace_kind: "sandbox",
                  stripe_customer_id: null,
                  subscription_status: null,
                  trial_ends_at: null,
                  subscription_seats: null,
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
              maybeSingle: async () => ({ data: null, error: null }),
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
                data: [
                  { user_id: "linked-user" },
                  { user_id: "manager-user" },
                ],
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
                  limit: async () => ({ data: [], error: null }),
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
  it("returns a complete simulated billing summary for test sandbox organizations", async () => {
    const summary = await loadOrganizationBillingSummary(
      createQueryClient() as unknown as Parameters<
        typeof loadOrganizationBillingSummary
      >[0],
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
    expect(summary.stripeConfigured).toBe(true);
    expect(summary.appUserCount).toBe(3);
    expect(summary.recentOperations?.map((operation) => operation.label)).toEqual([
      "Subscription started",
      "Seats synced",
      "Billing portal opened",
    ]);
  });
});
