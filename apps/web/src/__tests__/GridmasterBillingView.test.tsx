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

  it("opens an organization from the keyboard", async () => {
    const user = userEvent.setup();
    const { onSelectOrg } = renderView();

    await screen.findByText("Acme Health");
    screen.getByRole("button", { name: "Acme Health" }).focus();
    await user.keyboard("{Enter}");

    expect(onSelectOrg).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "billing");
  });

  it("links Stripe pages in test mode on a test key", async () => {
    mockFetchGridmasterBilling.mockResolvedValue({ ...billingSummary, stripeMode: "test" });

    renderView();

    expect(await screen.findByRole("link", { name: "Connected" })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/test/customers/cus_123",
    );
  });

  it("warns before giving more than a year of trial", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await openRowAction(user, "Change trial");
    await user.clear(await screen.findByLabelText("Trial days left"));
    await user.type(screen.getByLabelText("Trial days left"), "400");

    expect(screen.getByText("That's more than a year of free access.")).toBeInTheDocument();
  });

  it("says why a disabled action is off", async () => {
    const user = userEvent.setup();
    mockFetchGridmasterBilling.mockResolvedValue({
      ...billingSummary,
      organizations: [
        {
          ...billingSummary.organizations[0],
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      ],
    });

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Billing actions for Acme Health" }));
    const cancel = await screen.findByRole("menuitem", { name: "Cancel subscription" });
    expect(cancel).toHaveAccessibleDescription("No Stripe subscription.");
    expect(screen.getByRole("menuitem", { name: "Sync Stripe" })).toHaveAccessibleDescription(
      "No Stripe customer yet.",
    );
  });

  it("leaves ending a Stripe-billed trial to Stripe", async () => {
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await user.click(screen.getByRole("button", { name: "Billing actions for Acme Health" }));
    const endTrial = await screen.findByRole("menuitem", { name: "End trial…" });
    expect(endTrial).toHaveAttribute("aria-disabled", "true");
    expect(endTrial).toHaveAccessibleDescription(
      "Stripe bills this trial. Cancel the subscription to end it.",
    );
  });

  it("ends a running trial with the grace period, or locks it now", async () => {
    const localTrial = {
      ...billingSummary.organizations[0],
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    };
    mockFetchGridmasterBilling.mockResolvedValue({
      ...billingSummary,
      organizations: [localTrial],
    });
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await openRowAction(user, "End trial…");
    let dialog = await screen.findByRole("dialog", { name: "End trial" });
    expect(within(dialog).getByRole("radio", { name: /Give the usual 3 days/ })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "End trial" }));
    await waitFor(() =>
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: localTrial.orgId,
        action: "end_trial",
      }),
    );

    await openRowAction(user, "End trial…");
    dialog = await screen.findByRole("dialog", { name: "End trial" });
    await user.click(within(dialog).getByRole("radio", { name: /Lock now/ }));
    await user.click(within(dialog).getByRole("button", { name: "Lock now" }));
    await waitFor(() =>
      expect(mockUpdateGridmasterSubscription).toHaveBeenLastCalledWith({
        orgId: localTrial.orgId,
        action: "expire_trial",
      }),
    );
  });

  it("offers only locking once the trial is in its grace period", async () => {
    mockFetchGridmasterBilling.mockResolvedValue({
      ...billingSummary,
      organizations: [
        {
          ...billingSummary.organizations[0],
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          trialEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ],
    });
    const user = userEvent.setup();

    renderView();

    await screen.findByText("Acme Health");
    await openRowAction(user, "End trial…");
    const dialog = await screen.findByRole("dialog", { name: "End trial" });
    expect(within(dialog).getByRole("radio", { name: /Give the usual 3 days/ })).toBeDisabled();
    expect(within(dialog).getByText("The trial has already ended.")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Lock now/ })).toBeChecked();
    expect(
      within(dialog).getByText("Acme Health's trial has already ended. Lock it now?"),
    ).toBeInTheDocument();
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
    await openRowAction(user, "Cancel at period end");
    const dialog = await screen.findByRole("dialog", { name: "Cancel at period end" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel at period end" }));

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
    const dialog = await screen.findByRole("dialog", { name: "Override billing status" });
    expect(
      within(dialog).getByText("The organization stays open with full access, without a payment."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Stripe's next update for this subscription replaces this override.",
      ),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Override status" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reason/), "Comped for the pilot");
    await user.click(confirm);

    await waitFor(() => {
      expect(mockUpdateGridmasterSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "override_status",
        status: "active",
        reason: "Comped for the pilot",
      });
    });
  });
});
