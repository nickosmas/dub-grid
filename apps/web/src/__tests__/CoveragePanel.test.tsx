import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildCoverageMatrix,
  type CoverageCategorySnapshot,
  type CoverageMatrix,
} from "@dubgrid/schedule-core";

import CoveragePanel from "@/components/CoveragePanel";
import type { FocusArea } from "@/types";

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    departmentId: null,
    name: "North Wing",
    sortOrder: 1,
  },
];

const MON = new Date(2026, 9, 26);
const TUE = new Date(2026, 9, 27);
const WED = new Date(2026, 9, 28);
const ALL_PUBLISHED = new Set(["2026-10-26", "2026-10-27", "2026-10-28"]);

function snapshot(
  date: Date,
  actual: number,
  required: number,
  overrides: Partial<CoverageCategorySnapshot> = {},
): CoverageCategorySnapshot {
  return {
    focusAreaId: 1,
    focusAreaName: "North Wing",
    rowKey: "1:5:1",
    rowLabel: "Day Shift · Med Aide",
    shiftCategoryId: 1,
    shiftCategoryName: "Day Shift",
    date,
    status: { actual, required, isMet: actual >= required, hasRequirement: required > 0 },
    eligibleAssignmentDefinitionIds: [20],
    preferredOpenAssignmentDefinitionId: 20,
    shortageDetails: [],
    ...overrides,
  };
}

const MED_AIDE_SHORT = {
  shortageDetails: [
    {
      assignmentId: 20,
      assignmentLabel: "MA",
      assignmentFullName: "Med Aide",
      required: 3,
      actual: 2,
      shortage: 1,
    },
  ],
};

// Mon: was staffed, the draft opens a gap (and has started). Tue: the draft
// closes a published gap. Wed: still short, the draft opens a gap.
function changedMatrix(): CoverageMatrix {
  return buildCoverageMatrix({
    draft: [snapshot(MON, 1, 3), snapshot(TUE, 3, 3), snapshot(WED, 2, 3, MED_AIDE_SHORT)],
    published: [snapshot(MON, 3, 3), snapshot(TUE, 1, 3), snapshot(WED, 3, 3)],
    dates: [MON, TUE, WED],
    publishedDateKeys: ALL_PUBLISHED,
    isStarted: (s) => s.date === MON,
  });
}

function renderPanel(props: Partial<Parameters<typeof CoveragePanel>[0]> = {}) {
  return render(
    <CoveragePanel
      matrix={changedMatrix()}
      publishedDateKeys={ALL_PUBLISHED}
      focusAreas={focusAreas}
      activeFocusArea={null}
      publishedWindowState="published"
      canEditShifts
      hasRequirements
      todayKey="2026-10-26"
      getCellFill={() => ({ canFill: true, pendingPickups: 0 })}
      onFillSpot={() => {}}
      onShowInGrid={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );
}

function cell(name: RegExp) {
  return screen.getByRole("button", { name });
}

describe("CoveragePanel", () => {
  it("shows a neutral unpublished message before the first publish", () => {
    renderPanel({
      matrix: buildCoverageMatrix({
        draft: [],
        published: [],
        dates: [],
        publishedDateKeys: new Set(),
        isStarted: () => false,
      }),
      publishedDateKeys: new Set(),
      publishedWindowState: "unpublished",
      canEditShifts: false,
    });

    expect(screen.getAllByText("Not published yet").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Coverage details will appear after this period is published for the first time.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a partial-period note when only published dates are counted", () => {
    const staffed = [snapshot(MON, 3, 3)];
    renderPanel({
      matrix: buildCoverageMatrix({
        draft: staffed,
        published: staffed,
        dates: [MON],
        publishedDateKeys: new Set(["2026-10-26"]),
        isStarted: () => false,
      }),
      publishedDateKeys: new Set(["2026-10-26"]),
      publishedWindowState: "partial",
      canEditShifts: false,
    });

    expect(screen.getByText("Showing published dates only.")).toBeInTheDocument();
    expect(screen.getAllByText("No gaps on published dates").length).toBeGreaterThan(0);
  });

  it("reads and names each cell from the matrix", () => {
    renderPanel();

    expect(screen.getByRole("dialog", { name: "Coverage Check" })).toBeInTheDocument();
    expect(screen.getByText("1 shift short · 0 over")).toBeInTheDocument();
    const wednesday = cell(/North Wing, Day Shift · Med Aide, Wednesday, October 28/);
    expect(wednesday).toHaveTextContent("2/3");
    expect(wednesday).toHaveAccessibleName(
      "North Wing, Day Shift · Med Aide, Wednesday, October 28: 2 of 3 staffed, short 1, published 3 of 3",
    );
    expect(cell(/Monday, October 26/)).toHaveAccessibleName(
      "North Wing, Day Shift · Med Aide, Monday, October 26: 1 of 3 staffed, short 2, already started, not counted",
    );
    expect(screen.getByText("needs 3")).toBeInTheDocument();
  });

  it("compares the draft with the published schedule", () => {
    renderPanel();

    expect(
      screen.getByText(
        "Compared with the published schedule, this draft opens 1 gap and closes 1.",
      ),
    ).toBeInTheDocument();
  });

  it("marks opened and closed cells in the changes view and fades only started ones", () => {
    renderPanel();

    const monday = cell(/Monday, October 26/);
    const tuesday = cell(/Tuesday, October 27/);
    const wednesday = cell(/Wednesday, October 28/);
    expect(wednesday).not.toHaveClass("dg-cc-cell--opened");

    fireEvent.click(screen.getByRole("button", { name: "Changes since publish" }));

    expect(wednesday).toHaveClass("dg-cc-cell--opened");
    expect(tuesday).toHaveClass("dg-cc-cell--closed");
    expect(monday).toHaveClass("dg-cc-cell--past");
    expect(monday).not.toHaveClass("dg-cc-cell--opened");
    expect(tuesday).not.toHaveClass("dg-cc-cell--past");
    expect(wednesday).not.toHaveClass("dg-cc-cell--past");
    expect(screen.getByText("Opened by this draft")).toBeInTheDocument();
  });

  it("gives someone who cannot edit shifts no views and no comparison", () => {
    renderPanel({ canEditShifts: false });

    expect(screen.queryByRole("button", { name: "Whole draft" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Compared with the published schedule/)).not.toBeInTheDocument();
  });

  it("explains that Month view is not checked", () => {
    renderPanel({ matrix: null });

    expect(screen.getByText("Coverage is checked in 1 Week and 2 Weeks.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Coverage by day" })).not.toBeInTheDocument();
  });

  it("points to Settings when the organization has no requirements", () => {
    renderPanel({ hasRequirements: false });

    expect(screen.getAllByText("No coverage requirements").length).toBeGreaterThan(0);
    expect(screen.getByText(/Settings > Coverage/)).toBeInTheDocument();
  });

  it("makes every cell a button with an accessible name", () => {
    renderPanel();

    const region = screen.getByRole("region", { name: "Coverage by day" });
    const cells = within(region).getAllByRole("button");
    expect(cells).toHaveLength(3);
    for (const button of cells) {
      expect(button).toHaveAccessibleName(/North Wing, Day Shift · Med Aide, .+ staffed/);
    }
    expect(within(region).getByText("Staff short")).toBeInTheDocument();
  });

  describe("cell detail", () => {
    function detail() {
      return within(screen.getByRole("region", { name: "Selected day" }));
    }

    it("shows a short cell's Before and After, what is still needed, and both actions", () => {
      const onFillSpot = vi.fn();
      const onShowInGrid = vi.fn();
      renderPanel({ onFillSpot, onShowInGrid });

      fireEvent.click(cell(/Wednesday, October 28/));

      expect(detail().getByRole("heading")).toHaveTextContent("North Wing · Day Shift · Med Aide");
      expect(detail().getByText("Wed, Oct 28")).toBeInTheDocument();
      expect(detail().getByText("Short 1")).toBeInTheDocument();
      expect(detail().getByText("3/3")).toBeInTheDocument();
      expect(detail().getByText("2/3")).toBeInTheDocument();
      expect(detail().getByText("Med Aide (1)")).toBeInTheDocument();

      fireEvent.click(detail().getByRole("button", { name: "Fill a spot" }));
      expect(onFillSpot).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ dateKey: "2026-10-28" }),
      );
      fireEvent.click(detail().getByRole("button", { name: "Show in grid" }));
      expect(onShowInGrid).toHaveBeenCalledWith(1, "2026-10-28");
    });

    it("offers only Show in grid for a staffed or over cell", () => {
      renderPanel({
        matrix: buildCoverageMatrix({
          draft: [snapshot(MON, 3, 3), snapshot(TUE, 4, 3)],
          published: [],
          dates: [MON, TUE],
          publishedDateKeys: ALL_PUBLISHED,
          isStarted: () => false,
        }),
      });

      fireEvent.click(cell(/Monday, October 26/));
      expect(detail().getByText("Staffed")).toBeInTheDocument();
      expect(detail().queryByRole("button", { name: "Fill a spot" })).not.toBeInTheDocument();

      fireEvent.click(cell(/Tuesday, October 27/));
      expect(detail().getByText("Over by 1")).toBeInTheDocument();
      expect(detail().queryByRole("button", { name: "Fill a spot" })).not.toBeInTheDocument();
      expect(detail().getByRole("button", { name: "Show in grid" })).toBeInTheDocument();
    });

    it("never offers to fill a cell that has started", () => {
      renderPanel();

      fireEvent.click(cell(/Monday, October 26/));
      expect(detail().getByText("Mon, Oct 26 · already started")).toBeInTheDocument();
      expect(detail().getByText("Short 2")).toBeInTheDocument();
      expect(detail().queryByRole("button", { name: "Fill a spot" })).not.toBeInTheDocument();
    });

    it("says Not published yet for a day staff have not seen", () => {
      renderPanel({
        matrix: buildCoverageMatrix({
          draft: [snapshot(MON, 1, 3)],
          published: [],
          dates: [MON],
          publishedDateKeys: new Set(),
          isStarted: () => false,
        }),
        publishedDateKeys: new Set(),
        publishedWindowState: "unpublished",
      });

      fireEvent.click(cell(/Monday, October 26/));
      expect(detail().getByText("Not published yet")).toBeInTheDocument();
      expect(detail().getByText("1/3")).toBeInTheDocument();
    });

    it("says when pickup requests are already waiting and offers no Fill a spot", () => {
      renderPanel({ getCellFill: () => ({ canFill: false, pendingPickups: 2 }) });

      fireEvent.click(cell(/Wednesday, October 28/));
      expect(
        detail().getByText("2 pickup requests are waiting for this shift."),
      ).toBeInTheDocument();
      expect(detail().queryByRole("button", { name: "Fill a spot" })).not.toBeInTheDocument();
    });

    it("gives someone who cannot edit shifts the published count and no Fill a spot", () => {
      renderPanel({ canEditShifts: false });

      fireEvent.click(cell(/Wednesday, October 28/));
      expect(detail().queryByText("Before")).not.toBeInTheDocument();
      expect(detail().queryByRole("button", { name: "Fill a spot" })).not.toBeInTheDocument();
      expect(detail().getByRole("button", { name: "Show in grid" })).toBeInTheDocument();
    });
  });
});
