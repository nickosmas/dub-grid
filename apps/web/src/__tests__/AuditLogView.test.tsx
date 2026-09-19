import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditLogView from "@/components/gridmaster/AuditLogView";
import type { FullAuditLogEntry } from "@/types";

const mockFetchGridmasterFullAuditLog = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterFullAuditLog: (options: unknown) => mockFetchGridmasterFullAuditLog(options),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";

const billingEntry: FullAuditLogEntry = {
  id: 42,
  orgId: ORG_ID,
  orgName: "Acme Health",
  actorId: null,
  actorEmail: "Stripe",
  actorName: null,
  action: "billing.subscription_canceled",
  resourceType: "billing",
  resourceId: "sub_123",
  targetLabel: null,
  targetEmail: null,
  details: {
    initiated_by: "stripe",
    stripe_event_type: "customer.subscription.deleted",
    status: "canceled",
  },
  createdAt: "2026-09-03T12:00:00.000Z",
};

function renderAuditLogView(props: Partial<React.ComponentProps<typeof AuditLogView>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogView
        orgId={ORG_ID}
        title="Billing Activity"
        initialActionFilter="billing"
        timeZone="America/New_York"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("AuditLogView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    mockFetchGridmasterFullAuditLog.mockResolvedValue([billingEntry]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens full audit details from a billing activity row", async () => {
    const user = userEvent.setup();

    renderAuditLogView();

    await user.click(await screen.findByText("Canceled the subscription"));

    const dialog = await screen.findByRole("dialog", { name: "Activity details" });
    // The Stripe payload is never flattened raw; a cancellation has no rows to add.
    expect(within(dialog).queryByText("Stripe Event Type")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Customer Subscription Deleted")).not.toBeInTheDocument();
    expect(within(dialog).getByText("No additional details were recorded.")).toBeInTheDocument();
    expect(within(dialog).getByText("Item type")).toBeInTheDocument();
    expect(within(dialog).getByText("Organization")).toBeInTheDocument();
    expect(within(dialog).getByText("Acme Health")).toBeInTheDocument();
    expect(screen.queryByText("Billing sub_123")).not.toBeInTheDocument();
    expect(screen.queryByText("sub_123")).not.toBeInTheDocument();
    expect(screen.queryByText("billing.subscription_canceled")).not.toBeInTheDocument();
  });

  it("asks only for the selected period, bounded by the organization's days", async () => {
    renderAuditLogView();

    await waitFor(() => expect(mockFetchGridmasterFullAuditLog).toHaveBeenCalled());
    expect(mockFetchGridmasterFullAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        startDate: "2026-09-06T04:00:00.000Z",
        endDate: "2026-09-13T03:59:59.999Z",
        limit: 100,
      }),
    );
  });

  it("keeps its filters when the period changes", async () => {
    const user = userEvent.setup();
    renderAuditLogView();

    await waitFor(() => expect(mockFetchGridmasterFullAuditLog).toHaveBeenCalled());
    mockFetchGridmasterFullAuditLog.mockClear();

    await user.click(screen.getByRole("button", { name: "Go to previous period" }));

    await waitFor(() => expect(mockFetchGridmasterFullAuditLog).toHaveBeenCalled());
    expect(mockFetchGridmasterFullAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-08-30T04:00:00.000Z",
        actionPrefixes: expect.arrayContaining(["billing."]),
      }),
    );
  });

  it("says when times cannot be shown in an organization's zone", async () => {
    renderAuditLogView({ orgId: undefined, timeZone: null, title: "Audit log" });

    expect(await screen.findByText("Times shown in UTC")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Organization" })).toBeInTheDocument();
  });
});
