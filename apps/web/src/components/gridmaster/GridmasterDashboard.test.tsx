import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchGridmasterOverview = vi.fn();
vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterOverview: () => fetchGridmasterOverview(),
  fetchGridmasterAuditLog: () => Promise.resolve([]),
}));

import GridmasterDashboard from "./GridmasterDashboard";

const OVERVIEW = {
  platformHealth: {
    redis: { productionReady: true, configured: true, message: null },
    activeSessionCount: 3,
    staleSessionCount: 0,
    activeMobileTokenCount: 1,
  },
  orgRisk: { riskiestOrganizations: [], pendingSetupCount: 0, noLoginCount: 0 },
  businessHealth: {
    billingRiskCount: 0,
    trialEndingCount: 0,
    trialsNotStartedCount: 0,
    seatMismatchCount: 0,
  },
  complianceAlerts: { highRiskAuditCount: 0, activeImpersonationCount: 0 },
  activitySummary: { last24hCount: 0, last7dCount: 0, topCategories: [] },
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GridmasterDashboard
        organizations={[]}
        stats={new Map()}
        totalUsers={0}
        totalEmployees={0}
        onSelectOrg={() => {}}
        onCreateOrg={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("GridmasterDashboard oversight row", () => {
  beforeEach(() => {
    fetchGridmasterOverview.mockReset();
  });

  it("holds the row's space while the overview loads, then shows the cards", async () => {
    let resolveOverview!: (value: typeof OVERVIEW) => void;
    fetchGridmasterOverview.mockReturnValue(
      new Promise((resolve) => {
        resolveOverview = resolve;
      }),
    );
    renderDashboard();

    expect(screen.getAllByTestId("oversight-card-placeholder")).toHaveLength(5);
    expect(screen.queryByText("Platform Oversight")).not.toBeInTheDocument();

    resolveOverview(OVERVIEW);
    await screen.findByText("Platform Oversight");
    expect(screen.queryByTestId("oversight-card-placeholder")).not.toBeInTheDocument();
  });

  it("leaves no placeholder when the overview fails", async () => {
    fetchGridmasterOverview.mockRejectedValue(new Error("down"));
    renderDashboard();

    await waitFor(() =>
      expect(screen.queryByTestId("oversight-card-placeholder")).not.toBeInTheDocument(),
    );
  });
});
