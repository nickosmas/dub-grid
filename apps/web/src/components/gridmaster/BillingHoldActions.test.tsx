import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BILLING_POLICY, resolveBillingPolicy } from "@dubgrid/domain";
import type { GridmasterBillingOrgSummary } from "@/types";

const updateSubscription = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  syncGridmasterBilling: vi.fn(),
  updateGridmasterSubscription: (input: unknown) => updateSubscription(input),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({
    run: async (action: (accessToken: string) => Promise<unknown>) => {
      await action("access-token");
      return true;
    },
    dialog: null,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useGridmasterBillingActions } from "./useGridmasterBillingActions";

const DAY = 86_400_000;

function makeOrg(
  overrides: Partial<GridmasterBillingOrgSummary> = {},
): GridmasterBillingOrgSummary {
  return {
    orgId: "11111111-1111-4111-8111-111111111111",
    orgName: "Calm Haven",
    orgSlug: "calmhaven",
    status: "trialing",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialStartedAt: new Date(Date.now() - 10 * DAY).toISOString(),
    trialEndsAt: new Date(Date.now() + 4 * DAY).toISOString(),
    currentPeriodEnd: null,
    cancelAt: null,
    canceledAt: null,
    seats: null,
    appUsers: 3,
    employeeCount: 3,
    seatDelta: null,
    updatedAt: null,
    policy: resolveBillingPolicy(DEFAULT_BILLING_POLICY, {}),
    suspendedAt: null,
    billingHold: null,
    ...overrides,
  };
}

function Harness({ org }: { org: GridmasterBillingOrgSummary }) {
  const actions = useGridmasterBillingActions();
  return (
    <>
      <button type="button" onClick={() => actions.pauseBilling(org)}>
        open pause
      </button>
      <button type="button" onClick={() => actions.extendGrace(org)}>
        open grace
      </button>
      <button type="button" onClick={() => actions.confirm({ kind: "resume_billing", org })}>
        open resume
      </button>
      {actions.dialogs}
    </>
  );
}

function renderHarness(org: GridmasterBillingOrgSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness org={org} />
    </QueryClientProvider>,
  );
}

describe("billing hold actions", () => {
  beforeEach(() => {
    updateSubscription.mockReset();
    updateSubscription.mockResolvedValue({ success: true });
  });

  it("pauses only with a reason, saying what the pause does", async () => {
    const user = userEvent.setup();
    renderHarness(makeOrg({ stripeSubscriptionId: "sub_123" }));

    await user.click(screen.getByRole("button", { name: "open pause" }));
    expect(
      screen.getByText("The organization keeps full access while billing is paused."),
    ).toBeTruthy();
    expect(
      screen.getByText("The trial stops counting down. Resuming gives back the paused days."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Stripe stops collecting payment, and invoices made while paused are voided.",
      ),
    ).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Pause billing" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Reason/), "Contract renewal");
    await user.click(confirm);

    await waitFor(() =>
      expect(updateSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "pause_billing",
        reason: "Contract renewal",
      }),
    );
  });

  it("says how far a resume moves the trial", async () => {
    const user = userEvent.setup();
    renderHarness(
      makeOrg({
        billingHold: { pausedAt: new Date(Date.now() - 4 * DAY).toISOString(), reason: "Renewal" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "open resume" }));
    expect(
      screen.getByText(/The trial end moves 4 days later, to .*, giving back the paused time\./),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Resume billing" }));

    await waitFor(() =>
      expect(updateSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "resume_billing",
      }),
    );
  });

  it("extends grace within what's left of the limit", async () => {
    const user = userEvent.setup();
    renderHarness(makeOrg({ trialEndsAt: new Date(Date.now() - 5 * DAY).toISOString() }));

    await user.click(screen.getByRole("button", { name: "open grace" }));
    expect(
      screen.getByText("How many days should Calm Haven get on top of its 3-day grace period?"),
    ).toBeTruthy();
    expect(screen.getByText("Enter 1 to 87 days.")).toBeTruthy();

    await user.type(screen.getByRole("spinbutton", { name: "Grace days to add" }), "4");
    expect(
      screen.getByText(/The organization stays open until .*\. This sets its grace override\./),
    ).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Extend grace" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Reason/), "Waiting on PO");
    await user.click(confirm);

    await waitFor(() =>
      expect(updateSubscription).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        action: "extend_grace",
        days: 4,
        reason: "Waiting on PO",
      }),
    );
  });
});
