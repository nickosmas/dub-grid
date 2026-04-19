import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWeeklyShiftHours = vi.fn();
const fetchEmployeeUtilization = vi.fn();
const captureException = vi.fn();

vi.mock("@/lib/analytics", () => ({
  fetchWeeklyShiftHours: (...args: unknown[]) => fetchWeeklyShiftHours(...args),
  fetchEmployeeUtilization: (...args: unknown[]) =>
    fetchEmployeeUtilization(...args),
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
    fetchWeeklyShiftHours.mockRejectedValueOnce(new Error("query failed"));
    fetchEmployeeUtilization.mockRejectedValueOnce(new Error("query failed"));

    render(<AnalyticsCharts orgId="org-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Analytics are temporarily unavailable."),
      ).toBeInTheDocument();
    });
    expect(captureException).toHaveBeenCalled();
  });
});
