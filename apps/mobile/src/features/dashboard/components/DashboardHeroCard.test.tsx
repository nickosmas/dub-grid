import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

const routerPush = vi.fn();
vi.mock("expo-router", () => ({
  router: { push: routerPush },
}));

let DashboardHeroCard: (typeof import("./DashboardHeroCard"))["DashboardHeroCard"];

beforeAll(async () => {
  DashboardHeroCard = (await import("./DashboardHeroCard")).DashboardHeroCard;
});

describe("DashboardHeroCard", () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it("renders the headline, description, and status pill", () => {
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Attention", title: "2 coverage gaps", description: "Resolve staffing gaps." }}
        metrics={{ coveragePct: 86, openGapCount: 2, pendingApprovalsCount: 0 }}
      />,
    );

    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("2 coverage gaps")).toBeInTheDocument();
    expect(screen.getByText("Resolve staffing gaps.")).toBeInTheDocument();
  });

  it("shows the coverage percentage when configured", () => {
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Healthy", title: "Schedule health looks good", description: "" }}
        metrics={{ coveragePct: 86, openGapCount: 0, pendingApprovalsCount: 0 }}
      />,
    );

    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("shows a dash and 'Not configured' when coveragePct is null", () => {
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Setup", title: "Coverage requirements not configured", description: "" }}
        metrics={{ coveragePct: null, openGapCount: 0, pendingApprovalsCount: 0 }}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("navigates to the team schedule when the CTA is pressed", () => {
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Healthy", title: "Schedule health looks good", description: "" }}
        metrics={{ coveragePct: 100, openGapCount: 0, pendingApprovalsCount: 0 }}
      />,
    );

    fireEvent.click(screen.getByText("Review schedule"));

    expect(routerPush).toHaveBeenCalledWith("/(tabs)/team");
  });
});
