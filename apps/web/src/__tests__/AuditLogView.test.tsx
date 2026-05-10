import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditLogView from "@/components/gridmaster/AuditLogView";
import type { FullAuditLogEntry } from "@/types";

const mockFetchGridmasterFullAuditLog = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterFullAuditLog: (options: unknown) =>
    mockFetchGridmasterFullAuditLog(options),
}));

const billingEntry: FullAuditLogEntry = {
  id: 42,
  orgId: "11111111-1111-4111-8111-111111111111",
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
  createdAt: "2026-05-03T12:00:00.000Z",
};

function renderAuditLogView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogView
        orgId="11111111-1111-4111-8111-111111111111"
        title="Billing Activity"
        initialActionFilter="billing."
      />
    </QueryClientProvider>,
  );
}

describe("AuditLogView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchGridmasterFullAuditLog.mockResolvedValue([billingEntry]);
  });

  it("opens full audit details from a billing activity row", async () => {
    const user = userEvent.setup();

    renderAuditLogView();

    await user.click(await screen.findByText("Canceled subscription"));

    expect(
      await screen.findByRole("dialog", { name: "Audit log details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Stripe Event Type")).toBeInTheDocument();
    expect(screen.getByText("Customer Subscription Deleted")).toBeInTheDocument();
    expect(screen.getByText("Record type")).toBeInTheDocument();
    expect(screen.queryByText("Billing sub_123")).not.toBeInTheDocument();
    expect(screen.queryByText("sub_123")).not.toBeInTheDocument();
    expect(screen.getByText("Acme Health")).toBeInTheDocument();
    expect(screen.queryByText("billing.subscription_canceled")).not.toBeInTheDocument();
  });
});
