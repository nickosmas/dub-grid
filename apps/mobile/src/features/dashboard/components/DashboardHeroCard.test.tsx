import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

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

  it("routes the gap and approval chips only when there is something to open", () => {
    const onOpenGaps = vi.fn();
    const onOpenApprovals = vi.fn();
    render(
      <DashboardHeroCard
        summary={{ statusLabel: "Attention", title: "2 coverage gaps", description: "" }}
        metrics={{ coveragePct: 86, openGapCount: 2, pendingApprovalsCount: 0, draftSummary: null }}
        onOpenApprovals={onOpenApprovals}
        onOpenGaps={onOpenGaps}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2 open gaps" }));
    expect(onOpenGaps).toHaveBeenCalledTimes(1);

    // Nothing pending, so the chip is a plain figure that does not respond.
    const approvals = screen.getByRole("button", { name: "0 pending approvals" });
    expect(approvals).toBeDisabled();
    fireEvent.click(approvals);
    expect(onOpenApprovals).not.toHaveBeenCalled();
  });

  it("omits the coverage figure and meter when coveragePct is null", () => {
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

    // The headline already says requirements are not configured; a dash over
    // an empty meter only repeated it.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
