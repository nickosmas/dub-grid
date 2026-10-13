import { describe, expect, it } from "vitest";
import { loadOrganizationBillingSummary } from "./server";

// Sandbox orgs no longer get a synthetic billing summary — billing surfaces the
// real source org's data (the route resolves it with ignoreSandbox). So this
// exercises the real mapping for a normal organization: org row + subscription
// + billable app-user count + recent billing audit-log operations.
const auditActionFilter: string[] = [];

function createQueryClient(
  overrides: {
    org?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
  } = {},
) {
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
                  suspended_at: null,
                  ...overrides.org,
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
                  ...overrides.subscription,
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
            eq: async () => ({
              data: [
                { status: "active", archived_at: null, user_id: "linked-user" },
                { status: "active", archived_at: null, user_id: null },
                { status: "inactive", archived_at: null, user_id: null },
                { status: "removed", archived_at: "2026-09-01T00:00:00Z", user_id: "removed-user" },
              ],
              error: null,
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
                  { user_id: "removed-user" },
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
              in: (_column: string, actions: string[]) => {
                auditActionFilter.push(...actions);
                return {
                  order: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: 1,
                          action: "billing.subscription_created",
                          actor_email: "Stripe",
                          details: {
                            initiated_by: "stripe",
                            stripe_event_id: "evt_123",
                            stripe_event_type: "customer.subscription.created",
                            customer_id: "cus_123",
                            status: "active",
                            quantity: 5,
                          },
                          created_at: "2026-05-03T00:00:00Z",
                        },
                        {
                          id: 4,
                          action: "billing.status_overridden",
                          details: {
                            initiated_by: "gridmaster",
                            previous_status: "trialing",
                            new_status: "active",
                            reason: "Internal note",
                          },
                          created_at: "2026-05-02T12:00:00Z",
                        },
                      ],
                      error: null,
                    }),
                  }),
                };
              },
            }),
          }),
        };
      }
      if (table === "platform_billing_settings") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
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
    // 2 active employees + manager-user; the inactive employee and the removed
    // employee's still-live membership are not billed.
    expect(summary.appUserCount).toBe(3);
    expect(summary.subscriptionSeats).toBe(5);
    expect(summary.recentOperations?.map((operation) => operation.label)).toEqual([
      "Subscription started",
      "Billing status overridden",
    ]);
    // Upkeep is left out of the query, so it never takes a row.
    expect(auditActionFilter).toContain("billing.subscription_created");
    expect(auditActionFilter).not.toContain("billing.seats_synced");
    expect(auditActionFilter).not.toContain("billing.synced");
    expect(auditActionFilter).not.toContain("billing.portal_opened");
    // Only display fields reach the browser; provider ids and support notes don't.
    expect(summary.recentOperations?.[0]).toMatchObject({
      actorLabel: "Payment provider",
      details: { status: "active", quantity: 5 },
    });
    expect(summary.recentOperations?.[0]?.details).not.toHaveProperty("stripe_event_id");
    expect(summary.recentOperations?.[0]?.details).not.toHaveProperty("customer_id");
    expect(summary.recentOperations?.[1]?.details).toEqual({
      previous_status: "trialing",
      new_status: "active",
    });
  });

  it("offers a new subscription once the old one has ended", async () => {
    const summary = await loadOrganizationBillingSummary(
      createQueryClient({
        org: { subscription_status: "canceled" },
        subscription: { status: "canceled", canceled_at: "2026-05-10T00:00:00Z" },
      }) as unknown as Parameters<typeof loadOrganizationBillingSummary>[0],
      "org-1",
      { canManageBilling: true },
    );

    expect(summary.hasStripeCustomer).toBe(true);
    expect(summary.hasStripeSubscription).toBe(false);
  });

  it("reads a suspension as suspended, whatever the billing status", async () => {
    const summary = await loadOrganizationBillingSummary(
      createQueryClient({
        org: { suspended_at: "2026-05-10T00:00:00Z" },
      }) as unknown as Parameters<typeof loadOrganizationBillingSummary>[0],
      "org-1",
      { canManageBilling: true },
    );

    expect(summary.billingAccess).toMatchObject({ state: "suspended", isLocked: true });
  });

  it("keeps an organization open through its own longer grace period", async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const summary = await loadOrganizationBillingSummary(
      createQueryClient({
        org: {
          subscription_status: "trialing",
          trial_ends_at: fiveDaysAgo,
          trial_grace_days_override: 10,
        },
        subscription: { stripe_subscription_id: null, status: null },
      }) as unknown as Parameters<typeof loadOrganizationBillingSummary>[0],
      "org-1",
      { canManageBilling: true },
    );

    expect(summary.billingAccess).toMatchObject({ state: "trial_grace", isLocked: false });
  });

  it("reads a paused organization as paused and open", async () => {
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const summary = await loadOrganizationBillingSummary(
      createQueryClient({
        org: {
          subscription_status: "trialing",
          trial_ends_at: monthAgo,
          billing_paused_at: monthAgo,
        },
        subscription: { stripe_subscription_id: null, status: null },
      }) as unknown as Parameters<typeof loadOrganizationBillingSummary>[0],
      "org-1",
      { canManageBilling: true },
    );

    expect(summary.billingAccess).toMatchObject({ state: "paused", isLocked: false });
  });
});
