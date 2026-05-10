import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GridmasterBillingView from "@/components/gridmaster/GridmasterBillingView";
import type { GridmasterBillingSummary } from "@/types";

const mockFetchGridmasterBilling = vi.fn();
const mockSyncGridmasterBilling = vi.fn();
const mockUpdateGridmasterSubscription = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterBilling: () => mockFetchGridmasterBilling(),
  syncGridmasterBilling: (orgId: string) => mockSyncGridmasterBilling(orgId),
  updateGridmasterSubscription: (input: unknown) =>
    mockUpdateGridmasterSubscription(input),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const billingSummary: GridmasterBillingSummary = {
  generatedAt: "2026-05-02T00:00:00.000Z",
  organizations: [
    {
      orgId: "11111111-1111-4111-8111-111111111111",
      orgName: "Acme Health",
      orgSlug: "acme",
      status: "trialing",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      trialEndsAt: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-06-15T00:00:00.000Z",
      cancelAt: null,
      canceledAt: null,
      seats: 5,
      appUsers: 4,
      employeeCount: 20,
      seatDelta: 1,
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ],
  trialEndingSoon: [],
  riskOrganizations: [],
  missingStripeCustomer: [],
  seatMismatches: [],
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSelectOrg = vi.fn();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <GridmasterBillingView onSelectOrg={onSelectOrg} />
    </QueryClientProvider>,
  );

  return { ...view, onSelectOrg };
}

describe("GridmasterBillingView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchGridmasterBilling.mockResolvedValue(billingSummary);
    mockSyncGridmasterBilling.mockResolvedValue({ success: true });
    mockUpdateGridmasterSubscription.mockResolvedValue({ success: true });
  });

  it("syncs Stripe billing for an organization", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await user.click(screen.getByRole("button", { name: "Sync Stripe" }));

    await waitFor(() => {
      expect(mockSyncGridmasterBilling).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("opens the selected organization's billing tab from the table row", async () => {
    const user = userEvent.setup();
    const { onSelectOrg } = renderView();

    await user.click(await screen.findByText("Acme Health"));

    expect(onSelectOrg).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "billing",
    );
  });

  it("extends a trial from the row action", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Extend trial" }));
    await user.clear(await screen.findByLabelText("Trial extension days"));
    await user.type(screen.getByLabelText("Trial extension days"), "21");
    await user.click(screen.getByRole("button", { name: "Extend Trial" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "extend_trial",
        trialDays: 21,
      });
    });
  });

  it("cancels billing after confirmation", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel Billing" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "cancel",
      });
    });
  });

  it("schedules cancellation at period end after confirmation", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "End period" }));
    await user.click(screen.getByRole("button", { name: "End Period" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "cancel_at_period_end",
      });
    });
  });

  it("syncs seats after confirmation", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "True up seats" }));
    await user.click(screen.getByRole("button", { name: "True Up Seats" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "sync_seats",
      });
    });
  });

  it("overrides billing status after confirmation", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(
      screen.getByRole("button", { name: "Billing status for Acme Health" }),
    );
    await user.click(await screen.findByRole("option", { name: "Active" }));
    await user.click(screen.getByRole("button", { name: "Override" }));
    await user.click(screen.getByRole("button", { name: "Override Status" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "override_status",
        status: "active",
      });
    });
  });
});
