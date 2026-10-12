import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  updateGridmasterSubscription: (input: unknown) => mockUpdateGridmasterSubscription(input),
}));

// The identity check needs a real browser session; run the action as if
// the server accepted the current one.
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({
    run: async (action: (accessToken: string) => Promise<unknown>) => {
      await action("access-token");
      return true;
    },
    dialog: null,
  }),
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
      trialStartedAt: "2026-05-18T00:00:00.000Z",
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
  trialsNotStarted: [],
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

async function openRowAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Billing actions for Acme Health" }));
  await user.click(await screen.findByRole("menuitem", { name }));
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
    await openRowAction(user, "Sync Stripe");
    await user.click(screen.getByRole("button", { name: "Sync Stripe" }));

    await waitFor(() => {
      expect(mockSyncGridmasterBilling).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("shows 'Trial pending' for a trialing org whose trial has not started", async () => {
    mockFetchGridmasterBilling.mockResolvedValue({
      ...billingSummary,
      organizations: [{ ...billingSummary.organizations[0], trialEndsAt: null }],
    });

    renderView();

    await screen.findByText("Acme Health");
    // Status cell reads "Trial pending" (not the green "Trial active") when the
    // clock has not started. "Trial active" still exists as a status-override
    // dropdown option, so we assert on the pending label specifically.
    expect(screen.getByText("Trial pending")).toBeInTheDocument();
  });

  it("opens the selected organization's billing tab from the table row", async () => {
    const user = userEvent.setup();
    const { onSelectOrg } = renderView();

    await user.click(await screen.findByText("Acme Health"));

    expect(onSelectOrg).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "billing");
  });

  it("sets the trial days left from the row action", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await openRowAction(user, "Change trial");
    await user.clear(await screen.findByLabelText("Trial days left"));
    await user.type(screen.getByLabelText("Trial days left"), "21");
    const trialDialog = await screen.findByRole("dialog", { name: "Change trial" });
    expect(within(trialDialog).getByText(/^The trial will end on /)).toBeInTheDocument();
    await user.click(within(trialDialog).getByRole("button", { name: "Save trial" }));

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "set_trial_days",
        trialDays: 21,
      });
    });
  });

  it("leaves ending a Stripe-billed trial to Stripe", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Billing actions for Acme Health" }));
    expect(await screen.findByRole("menuitem", { name: "End trial now" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Expire trial" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("cancels billing after confirmation", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await openRowAction(user, "Cancel subscription");
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
    await openRowAction(user, "End at period end");
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
    await openRowAction(user, "True up seats");
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
    await openRowAction(user, "Active");
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
