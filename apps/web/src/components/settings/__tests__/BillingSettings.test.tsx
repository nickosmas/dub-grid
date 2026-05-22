import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillingSettings from "@/components/settings/BillingSettings";
import { fetchOrganizationBilling } from "@/features/billing/client";
import type { Organization, OrganizationBillingSummary } from "@/types";

const mockSignOutLocal = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOutLocal: mockSignOutLocal }),
  useMediaQuery: () => false,
  MOBILE: "(max-width: 767px)",
  useIsInSandbox: () => false,
  useSandboxSourceOrgId: () => null,
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
      actorLabel: "Stripe",
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
      actorLabel: "Gridmaster",
      resourceType: "billing",
      resourceId: null,
      details: {},
      createdAt: "2026-05-03T11:00:00.000Z",
    },
    {
      id: "44",
      action: "billing.subscription_created",
      label: "Subscription started",
      actorLabel: "You (Olivia Chen)",
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
    mockSignOutLocal.mockResolvedValue(undefined);
    vi.mocked(fetchOrganizationBilling).mockResolvedValue(billingSummary);
  });

  it("shows explicit trial time left before the warning threshold", async () => {
    renderBillingSettings();

    expect(await screen.findByText("Trial time left")).toBeInTheDocument();
    expect(screen.getByText("14 days")).toBeInTheDocument();
    expect(screen.getByText("App users")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.queryByText("Active organization users")).not.toBeInTheDocument();
    expect(screen.queryByText("Ends May 16, 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Billed seats")).not.toBeInTheDocument();
    expect(screen.queryByText("Seat delta")).not.toBeInTheDocument();
    expect(screen.queryByText("Renewal")).not.toBeInTheDocument();
    expect(screen.getByText("Trial ends")).toBeInTheDocument();
    expect(screen.getByText("May 16, 2026")).toBeInTheDocument();
    const trialEndsLabel = screen.getByText("Trial ends");
    const operationsHeading = screen.getByText("Recent billing operations");
    expect(operationsHeading).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Recent billing operations" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Source" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "When" }),
    ).toBeInTheDocument();
    expect(
      trialEndsLabel.compareDocumentPosition(operationsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Subscription canceled")).toBeInTheDocument();
    expect(screen.getByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("Trial extended")).toBeInTheDocument();
    expect(screen.getByText("Gridmaster")).toBeInTheDocument();
    expect(screen.queryByText("gridmaster@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Subscription started")).toBeInTheDocument();
    expect(screen.getByText("You (Olivia Chen)")).toBeInTheDocument();
  });

  it("opens billing operation details from the activity table", async () => {
    renderBillingSettings();

    fireEvent.click(await screen.findByText("Subscription canceled"));

    expect(
      await screen.findByRole("dialog", { name: "Billing activity details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Stripe Event Type")).toBeInTheDocument();
    expect(screen.getByText("Customer Subscription Deleted")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.getByText("Record type")).toBeInTheDocument();
    expect(screen.queryByText("Billing sub_123")).not.toBeInTheDocument();
    expect(screen.queryByText("sub_123")).not.toBeInTheDocument();
    expect(screen.queryByText("billing.subscription_canceled")).not.toBeInTheDocument();
  });

  it("explains a pending trial that has not started yet", async () => {
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      trialEndsAt: null,
      billingAccess: {
        ...billingSummary.billingAccess,
        state: "trial_pending",
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderBillingSettings();

    expect(await screen.findByText("App users")).toBeInTheDocument();
    expect(screen.queryByText("Trial time left")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your trial starts the first time an administrator signs in. The countdown begins then. Refresh this page to see your trial end date.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show sign out while billing is available", async () => {
    renderBillingSettings();

    expect(await screen.findByText("App users")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
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

    expect(mockSignOutLocal).toHaveBeenCalledTimes(1);
  });
});
