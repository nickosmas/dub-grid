import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let DashboardHeroCard: (typeof import("./DashboardHeroCard"))["DashboardHeroCard"];
let DashboardHeadline: (typeof import("./DashboardHeroCard"))["DashboardHeadline"];

beforeAll(async () => {
  const module = await import("./DashboardHeroCard");
  DashboardHeroCard = module.DashboardHeroCard;
  DashboardHeadline = module.DashboardHeadline;
});

describe("DashboardHeadline", () => {
  it("renders the period's headline and sentence above the cards", () => {
    render(
      <DashboardHeadline
        summary={{
          statusLabel: "Attention",
          title: "2 coverage gaps",
          description: "Resolve staffing gaps.",
        }}
      />,
    );

    expect(screen.getByText("2 coverage gaps")).toBeInTheDocument();
    expect(screen.getByText("Resolve staffing gaps.")).toBeInTheDocument();
    // The status word left with the pill; the card tones carry it now.
    expect(screen.queryByText("Attention")).not.toBeInTheDocument();
  });
});

describe("DashboardHeroCard", () => {
  it("shows the coverage percentage with its meter when configured", () => {
    render(
      <DashboardHeroCard
        metrics={{ coveragePct: 86, openGapCount: 0, pendingApprovalsCount: 0, draftSummary: null }}
      />,
    );

    expect(screen.getByText("86%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Coverage")).toBeInTheDocument();
  });

  it("routes the gap and approval stats only when there is something to open", () => {
    const onOpenGaps = vi.fn();
    const onOpenApprovals = vi.fn();
    render(
      <DashboardHeroCard
        metrics={{ coveragePct: 86, openGapCount: 2, pendingApprovalsCount: 0, draftSummary: null }}
        onOpenApprovals={onOpenApprovals}
        onOpenGaps={onOpenGaps}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2 open gaps" }));
    expect(onOpenGaps).toHaveBeenCalledTimes(1);

    const approvals = screen.getByRole("button", { name: "0 pending approvals" });
    expect(approvals).toBeDisabled();
    fireEvent.click(approvals);
    expect(onOpenApprovals).not.toHaveBeenCalled();
  });

  it("omits the coverage figure and meter when coveragePct is null", () => {
    render(
      <DashboardHeroCard
        metrics={{
          coveragePct: null,
          openGapCount: 0,
          pendingApprovalsCount: 0,
          draftSummary: null,
        }}
      />,
    );

    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("open gaps")).toBeInTheDocument();
  });

  it("opens the coverage screen from the card title", () => {
    const onOpenCoverage = vi.fn();
    render(
      <DashboardHeroCard
        metrics={{ coveragePct: 92, openGapCount: 0, pendingApprovalsCount: 0, draftSummary: null }}
        onOpenCoverage={onOpenCoverage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "See all: Coverage" }));
    expect(onOpenCoverage).toHaveBeenCalledTimes(1);
  });
});
