import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchDashboardAnalytics = vi.fn();
const captureException = vi.fn();

vi.mock("@/features/dashboard/client", () => ({
  fetchDashboardAnalytics: (...args: unknown[]) =>
    fetchDashboardAnalytics(...args),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import AnalyticsCharts from "@/components/dashboard/AnalyticsCharts";

describe("AnalyticsCharts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an explicit unavailable state when analytics queries fail", async () => {
    fetchDashboardAnalytics.mockRejectedValueOnce(new Error("query failed"));

    render(<AnalyticsCharts orgId="org-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Analytics are temporarily unavailable."),
      ).toBeInTheDocument();
    });
    expect(captureException).toHaveBeenCalled();
  });
});
