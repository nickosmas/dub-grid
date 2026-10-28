import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingSettings from "@/components/settings/BillingSettings";
import { fetchOrganizationBilling, startBillingCheckout } from "@/features/billing/client";
import { toast } from "sonner";
import type { Organization, OrganizationBillingSummary } from "@/types";

const mockSignOut = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOut: mockSignOut }),
  useMediaQuery: () => false,
  MOBILE: "(max-width: 767px)",
  useIsInSandbox: () => false,
  useSandboxSourceOrgId: () => null,
  useClientFeatureFlags: () => ({
    stripe: true,
    csvImport: true,
    csvExport: true,
    reports: true,
    printing: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/billing/client", () => ({
  completeBillingCheckout: vi.fn(),
  fetchOrganizationBilling: vi.fn(),
  openBillingPortal: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

const organization = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme Health",
} as Organization;

const billingSummary: OrganizationBillingSummary = {
  orgId: organization.id,
  orgName: "Acme Health",
  orgSlug: "acme",
  status: "trialing",
  trialEndsAt: "2026-05-16T12:00:00.000Z",
  currentPeriodEnd: null,
  cancelAt: null,
  canceledAt: null,
  subscriptionSeats: null,
  appUserCount: 6,
  seatDelta: null,
  hasStripeCustomer: false,
  hasStripeSubscription: false,
  stripeConfigured: true,
  canManageBilling: true,
  recentOperations: [
    {
      id: "42",
      action: "billing.subscription_canceled",
      label: "Subscription canceled",
      actorLabel: "Payment provider",
      resourceType: "billing",
      resourceId: "sub_123",
      details: {
        initiated_by: "stripe",
        stripe_event_type: "customer.subscription.deleted",
        status: "canceled",
      },
      createdAt: "2026-05-03T12:00:00.000Z",
    },
    {
      id: "43",
      action: "billing.trial_extended",
      label: "Trial extended",
      actorLabel: "DubGrid Support",
      resourceType: "billing",
      resourceId: null,
      details: {},
      createdAt: "2026-05-03T11:00:00.000Z",
    },
    {
      id: "44",
      action: "billing.subscription_created",
      label: "Subscription started",
      actorLabel: "You",
      resourceType: "billing",
      resourceId: "sub_456",
      details: {},
      createdAt: "2026-05-03T10:00:00.000Z",
    },
  ],
  billingAccess: {
    state: "trialing",
    reason: "trial_active",
    isLocked: false,
    shouldNotifyAdmins: false,
    daysUntilTrialEnd: 14,
    trialGraceEndsAt: "2026-05-19T12:00:00.000Z",
  },
  trialStartedAt: "2026-05-02T12:00:00.000Z",
  billingPolicy: { trialDays: 14, trialGraceDays: 3, paymentGraceDays: 7 },
  seatHistory: [],
  lastPayment: null,
  outstandingPayment: null,
};

function renderBillingSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BillingSettings organization={organization} />
    </QueryClientProvider>,
  );
}

describe("BillingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockReset();
    vi.mocked(fetchOrganizationBilling).mockResolvedValue(billingSummary);
    // The fixture trial ends 2026-05-16T12:00Z; the countdown reads the clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down a running trial and lists billing history without names", async () => {
    renderBillingSettings();

    expect(await screen.findByText("Trial days left")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "14 days: Left in your free trial" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Seats in use", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Billing history" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "By" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveAttribute("data-settings-table-layout", "distributed");
    expect(within(table).getByText("Subscription canceled.")).toBeInTheDocument();
    expect(within(table).getByText("Payment provider")).toBeInTheDocument();
    expect(within(table).getByText("Free trial extended.")).toBeInTheDocument();
    expect(within(table).getByText("DubGrid Support")).toBeInTheDocument();
    expect(within(table).getByText("You")).toBeInTheDocument();
    expect(screen.queryByText(/Olivia/)).not.toBeInTheDocument();
    expect(screen.queryByText("sub_123")).not.toBeInTheDocument();
  });

  it("filters billing history by kind", async () => {
    renderBillingSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Trial" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Free trial extended.")).toBeInTheDocument();
    expect(within(table).queryByText("Subscription canceled.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    expect(screen.getByText("There are no payments here yet.")).toBeInTheDocument();
  });

  it("explains a pending trial that has not started yet", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      trialEndsAt: null,
      trialStartedAt: null,
      billingAccess: {
        ...billingSummary.billingAccess,
        state: "trial_pending",
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(await screen.findByText("Your free trial hasn't started yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your 14-day free trial begins the first time a Super Admin signs in. You won't be charged until you start a subscription.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Trial days left")).not.toBeInTheDocument();
  });

  it("does not show sign out while billing is available", async () => {
    renderBillingSettings();

    expect(await screen.findByText("Trial days left")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows sign out only when billing is locked", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      status: "canceled",
      hasStripeSubscription: false,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("offers a new subscription to an organization whose subscription ended", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      status: "canceled",
      hasStripeCustomer: true,
      hasStripeSubscription: false,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(await screen.findByRole("button", { name: "Start subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("says a suspended organization is suspended", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      status: "active",
      billingAccess: {
        state: "suspended",
        reason: "suspended",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(await screen.findByText("Suspended")).toBeInTheDocument();
    expect(screen.getByText("Your organization is suspended.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "DubGrid Support suspended your organization. Contact DubGrid Support for help.",
      ),
    ).toBeInTheDocument();
  });

  it("says billing is paused and lists the pause in the activity", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      billingPausedAt: "2026-05-02T10:00:00.000Z",
      recentOperations: [
        {
          id: "50",
          action: "billing.paused",
          label: "Billing paused",
          actorLabel: "DubGrid Support",
          resourceType: "organization",
          resourceId: null,
          details: {},
          createdAt: "2026-05-02T10:00:00.000Z",
        },
      ],
      billingAccess: {
        state: "paused",
        reason: "billing_paused",
        isLocked: false,
        shouldNotifyAdmins: false,
        daysUntilTrialEnd: 9,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(
      await screen.findByText(
        /Your organization stays open, and you won't be charged while billing is paused\. Your trial days don't count down while it's paused\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("They don't count down while billing is paused.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start subscription" })).not.toBeInTheDocument();
    const row = screen.getAllByText("Billing paused.").find((node) => node.closest("tr"));
    expect(row?.closest("tr")).toHaveTextContent("DubGrid Support");
  });

  it("tells an admin who tries to subscribe twice to use Manage billing", async () => {
    const message =
      "Your organization already has a subscription. Use Manage billing to change it.";
    vi.mocked(startBillingCheckout).mockRejectedValueOnce(new Error(message));

    renderBillingSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Start subscription" }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  });

  it("tells seats in use apart from paid seats", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      status: "active",
      subscriptionSeats: 4,
      seatDelta: -2,
      hasStripeCustomer: true,
      hasStripeSubscription: true,
      seatBreakdown: {
        activeStaff: 6,
        suspended: 0,
        awayManaging: 0,
        managementOnly: 0,
        awayNotBilled: 1,
        archived: 2,
        total: 6,
      },
      billingAccess: {
        state: "active",
        reason: "active_subscription",
        isLocked: false,
        shouldNotifyAdmins: false,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(
      await screen.findByText(
        "2 seats in use aren't paid for yet. DubGrid Support updates your paid seats to match the seats in use, and the change is prorated on your next invoice.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.getByText("Offboarded staff")).toBeInTheDocument();
    expect(screen.getByText("6 in use, 3 not billed")).toBeInTheDocument();
  });

  it("explains in plain words when online billing isn't set up", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      stripeConfigured: false,
    });

    renderBillingSettings();

    expect(
      await screen.findByText(
        "Online billing isn't set up here. Contact DubGrid Support to subscribe.",
      ),
    ).toBeInTheDocument();
  });
});
