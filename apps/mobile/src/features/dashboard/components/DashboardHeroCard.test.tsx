import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let DashboardHeroCard: (typeof import("./DashboardHeroCard"))["DashboardHeroCard"];

beforeAll(async () => {
  DashboardHeroCard = (await import("./DashboardHeroCard")).DashboardHeroCard;
});

describe("DashboardHeroCard", () => {
  it("renders the headline and status pill", () => {
    render(
      <DashboardHeroCard
        summary={{
          statusLabel: "Attention",
          title: "2 coverage gaps",
          description: "Resolve staffing gaps.",
        }}
        metrics={{ coveragePct: 86, openGapCount: 2, pendingApprovalsCount: 0, draftSummary: null }}
      />,
    );

    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("2 coverage gaps")).toBeInTheDocument();
  });

  it("shows the coverage percentage when configured", () => {
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Healthy", title: "Schedule health looks good", description: "" }}
        metrics={{ coveragePct: 86, openGapCount: 0, pendingApprovalsCount: 0, draftSummary: null }}
      />,
    );

    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("shows a dash and 'Not configured' when coveragePct is null", () => {
    render(
      <DashboardHeroCard
        summary={{
          statusLabel: "Setup",
          title: "Coverage requirements not configured",
          description: "",
        }}
        metrics={{
          coveragePct: null,
          openGapCount: 0,
          pendingApprovalsCount: 0,
          draftSummary: null,
        }}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });
});
