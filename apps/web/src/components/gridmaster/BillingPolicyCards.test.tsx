import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBillingPolicy } from "@dubgrid/domain";
import type { ReactNode } from "react";
import type { GridmasterBillingOrgSummary } from "@/types";

const fetchPolicy = vi.fn();
const updatePolicy = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterBillingPolicy: () => fetchPolicy(),
  updateGridmasterBillingPolicy: (input: unknown) => updatePolicy(input),
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

import { OrganizationBillingPolicyCard, PlatformBillingPolicyCard } from "./BillingPolicyCards";

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const platform = {
  trialDays: 14,
  trialGraceDays: 3,
  trialReminderDays: 7,
  paymentGraceDays: 14,
  updatedAt: "2026-10-13T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchPolicy.mockResolvedValue({ platform });
  updatePolicy.mockResolvedValue({});
});

describe("PlatformBillingPolicyCard", () => {
  it("edits the platform defaults against the version it read", async () => {
    const user = userEvent.setup();
    wrap(<PlatformBillingPolicyCard />);

    expect(await screen.findAllByText("14 days")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit billing policy" });
    const grace = within(dialog).getByLabelText("Grace after the trial");
    await user.clear(grace);
    await user.type(grace, "5");
    await user.click(within(dialog).getByRole("button", { name: "Save policy" }));

    await waitFor(() =>
      expect(updatePolicy).toHaveBeenCalledWith({
        scope: "platform",
        values: { trialDays: 14, trialGraceDays: 5, trialReminderDays: 7, paymentGraceDays: 14 },
        expectedUpdatedAt: platform.updatedAt,
      }),
    );
  });
});

describe("OrganizationBillingPolicyCard", () => {
  const org = {
    orgId: "11111111-1111-4111-8111-111111111111",
    orgName: "Acme Health",
    policy: resolveBillingPolicy(platform, { trialGraceDays: 10 }),
  } as GridmasterBillingOrgSummary;

  it("labels each value with where it comes from", () => {
    wrap(<OrganizationBillingPolicyCard org={org} />);

    expect(screen.getByText("10 days")).toBeInTheDocument();
    expect(screen.getAllByText("Platform default")).toHaveLength(3);
    expect(screen.getByText("Organization override")).toBeInTheDocument();
  });

  it("sends only the changes: a new override and a cleared one", async () => {
    const user = userEvent.setup();
    wrap(<OrganizationBillingPolicyCard org={org} />);

    await user.click(screen.getByRole("button", { name: "Edit overrides" }));
    const dialog = await screen.findByRole("dialog", { name: "Billing policy overrides" });
    await user.click(
      within(dialog).getByRole("switch", { name: "Override Grace after the trial" }),
    );
    await user.click(within(dialog).getByRole("switch", { name: "Override Trial length" }));
    const trial = within(dialog).getByLabelText("Trial length for Acme Health");
    await user.clear(trial);
    await user.type(trial, "30");
    await user.click(within(dialog).getByRole("button", { name: "Save overrides" }));

    await waitFor(() =>
      expect(updatePolicy).toHaveBeenCalledWith({
        scope: "organization",
        orgId: org.orgId,
        overrides: { trialDays: 30, trialGraceDays: null },
      }),
    );
  });
});
