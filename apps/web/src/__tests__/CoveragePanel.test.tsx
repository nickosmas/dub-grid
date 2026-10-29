import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildCoverageMatrix,
  type CoverageCategorySnapshot,
  type CoverageBuildPreview,
  type CoverageMatrix,
  type CoverageRuledOut,
  type CoverageSuggestion,
} from "@dubgrid/schedule-core";
import { appliedSuggestionText } from "@/components/coverage-check/CoverageSuggestions";
import {
  planningPercent,
  type ScheduleBuildState,
} from "@/components/coverage-check/ScheduleBuildSection";

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
      describeCellChanges={() => []}
      onFillSpot={() => {}}
      onShowInGrid={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );
}

/** A matrix cell; date headings are buttons too, so pick the cell explicitly. */
function cell(name: RegExp) {
  const found = screen
    .getAllByRole("button", { name })
    .find((button) => button.classList.contains("dg-cc-cell"));
  if (!found) throw new Error(`no cell named ${name}`);
  return found;
}

function dateHeading(name: RegExp) {
  const found = screen
    .getAllByRole("button", { name })
    .find((button) => button.classList.contains("dg-cc-day"));
  if (!found) throw new Error(`no date named ${name}`);
  return found;
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
      screen.getByText("You'll see coverage once this period is published."),
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

    expect(screen.getByRole("dialog", { name: "Schedule Builder" })).toBeInTheDocument();
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

    expect(screen.getByText("Schedule Builder doesn't work in Month view.")).toBeInTheDocument();
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

  describe("what changed", () => {
    function detail() {
      return within(screen.getByRole("region", { name: "Selected day" }));
    }
    const sameOnBothSides = (actual: number, required: number, published = ALL_PUBLISHED) =>
      buildCoverageMatrix({
        draft: [snapshot(MON, actual, required)],
        published: [snapshot(MON, actual, required)],
        dates: [MON],
        publishedDateKeys: published,
        isStarted: () => false,
      });

    it("lists the lines it is given, in order, under What changed", () => {
      const describeCellChanges = vi.fn(() => [
        "Ben Shepherd was taken off Day Shift · Med Aide",
        "Ana Crawford was scheduled for Day Shift · Med Aide",
      ]);
      renderPanel({ describeCellChanges });

      fireEvent.click(cell(/Wednesday, October 28/));

      expect(detail().getByText("What changed")).toBeInTheDocument();
      expect(
        detail()
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        "Ben Shepherd was taken off Day Shift · Med Aide",
        "Ana Crawford was scheduled for Day Shift · Med Aide",
      ]);
      expect(describeCellChanges).toHaveBeenCalledWith(
        expect.objectContaining({ rowKey: "1:5:1" }),
        expect.objectContaining({ dateKey: "2026-10-28" }),
      );
    });

    it("says a short cell nothing touched was already short", () => {
      renderPanel({ matrix: sameOnBothSides(1, 3) });

      fireEvent.click(cell(/Monday, October 26/));
      expect(
        detail().getByText("Short since it was published. The draft doesn't change that."),
      ).toBeInTheDocument();
      expect(detail().queryByText("What changed")).not.toBeInTheDocument();
    });

    it("says nothing changed a staffed cell", () => {
      renderPanel({ matrix: sameOnBothSides(3, 3) });

      fireEvent.click(cell(/Monday, October 26/));
      expect(detail().getByText("The draft doesn't change this count.")).toBeInTheDocument();
    });

    it("says there is nothing to compare before a first publish", () => {
      renderPanel({
        matrix: sameOnBothSides(3, 3, new Set()),
        publishedDateKeys: new Set(),
        publishedWindowState: "unpublished",
      });

      fireEvent.click(cell(/Monday, October 26/));
      expect(
        detail().getByText("Not published yet, so there is nothing to compare."),
      ).toBeInTheDocument();
    });

    it("shows someone who cannot edit shifts no draft changes", () => {
      const describeCellChanges = vi.fn(() => ["Ana Crawford was scheduled for Day Shift"]);
      renderPanel({ canEditShifts: false, describeCellChanges });

      fireEvent.click(cell(/Wednesday, October 28/));
      expect(detail().queryByText("What changed")).not.toBeInTheDocument();
      expect(detail().queryByText(/Nothing in this draft/)).not.toBeInTheDocument();
      expect(describeCellChanges).not.toHaveBeenCalled();
    });
  });

  describe("suggestions", () => {
    const suggestion = (
      id: string,
      kind: CoverageSuggestion["kind"],
      dateKey = "2026-10-28",
    ): CoverageSuggestion => ({
      id,
      kind,
      employeeId: kind === "pattern" ? null : "ana",
      requestId: kind === "approvePickup" ? "r1" : null,
      final: kind === "approvePickup",
      subject: {
        rowKey: "1:5:1",
        focusAreaId: 1,
        assignmentId: 20,
        dateKey,
        otherDateKey: null,
        otherAssignmentIds: [],
      },
      targets: [{ rowKey: "1:5:1", dateKey }],
      overrides: [],
      effects: [],
      closes: 1,
      filled: 1,
      clearsOver: 0,
    });
    const view = (id: string, kind: CoverageSuggestion["kind"], title = `Do ${id}`) => ({
      suggestion: suggestion(id, kind),
      text: {
        title,
        detail: `Detail ${id}`,
        outcome: kind === "pattern" ? null : `Outcome ${id}`,
        effect: kind === "pattern" ? null : "Closes 1 gap",
        changes:
          kind === "pattern"
            ? []
            : [
                `Wed, Oct 28 · North Wing · Day Shift · Med Aide: 2/3 staffed now, 3/3 after (${id})`,
              ],
      },
    });
    const items = [
      view("a", "moveBack", "Move Ana Crawford's Day Shift from Thu, Oct 29 back to Wed, Oct 28"),
      view("b", "restore"),
      view("c", "assign"),
      view("d", "approvePickup"),
      view("e", "pattern"),
    ];
    const withSuggestions = (overrides = {}) =>
      renderPanel({
        suggestions: {
          items,
          notSuggestedByCell: new Map([
            [
              "1:5:1|2026-10-28",
              [
                "Ben Shepherd: Sick that day",
                "Cat Morrison: works Evening Shift that day, which overlaps",
              ],
            ],
          ]),
        },
        ...overrides,
      });
    const day = () =>
      within(screen.getByRole("region", { name: "Suggestions for Wednesday, October 28" }));

    it("lists no suggestions until a date is picked, and marks the dates that have them", () => {
      withSuggestions();

      expect(screen.queryByRole("region", { name: /^Suggestions for/ })).not.toBeInTheDocument();
      expect(
        screen.getByText("1 day has suggestions. Select a date to see them."),
      ).toBeInTheDocument();
      expect(dateHeading(/Wednesday, October 28, has suggestions/)).toBeInTheDocument();
      expect(dateHeading(/Tuesday, October 27/)).not.toHaveAccessibleName(/has suggestions/);
      expect(screen.getByText("Date with suggestions")).toBeInTheDocument();
    });

    it("shows a picked date's suggestions in full, each with its action", () => {
      withSuggestions();
      fireEvent.click(dateHeading(/Wednesday, October 28/));

      expect(dateHeading(/Wednesday, October 28/)).toHaveAttribute("aria-pressed", "true");
      expect(day().getByText("5 suggestions")).toBeInTheDocument();
      expect(day().getByText("1 staff short")).toBeInTheDocument();
      for (const label of ["Move back", "Restore", "Schedule", "Approve"]) {
        expect(day().getByRole("button", { name: new RegExp(`^${label}:`) })).toBeInTheDocument();
      }
      expect(
        day().getAllByRole("button", { name: /^(Move back|Restore|Schedule|Approve):/ }),
      ).toHaveLength(4);
      expect(day().getByText("Detail a")).toBeInTheDocument();
      expect(day().getByText("Outcome a")).toBeInTheDocument();
      expect(
        day().getByText(
          "Wed, Oct 28 · North Wing · Day Shift · Med Aide: 2/3 staffed now, 3/3 after (a)",
        ),
      ).toBeInTheDocument();
      expect(day().getByText("Detail e")).toBeInTheDocument();
      expect(day().queryByText("Outcome e")).not.toBeInTheDocument();

      fireEvent.click(dateHeading(/Wednesday, October 28/));
      expect(screen.queryByRole("region", { name: /^Suggestions for/ })).not.toBeInTheDocument();
    });

    it("applies a suggestion from the picked date", () => {
      const onApplySuggestion = vi.fn();
      withSuggestions({ onApplySuggestion });
      fireEvent.click(dateHeading(/Wednesday, October 28/));

      fireEvent.click(day().getByRole("button", { name: /^Move back: Move Ana/ }));
      expect(onApplySuggestion).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    });

    it("selects a date or a cell, never both", () => {
      withSuggestions();

      fireEvent.click(cell(/Wednesday, October 28/));
      expect(screen.getByRole("region", { name: "Selected day" })).toBeInTheDocument();
      fireEvent.click(dateHeading(/Wednesday, October 28/));
      expect(screen.queryByRole("region", { name: "Selected day" })).not.toBeInTheDocument();
      expect(day().getByText("5 suggestions")).toBeInTheDocument();
      fireEvent.click(cell(/Wednesday, October 28/));
      expect(screen.queryByRole("region", { name: /^Suggestions for/ })).not.toBeInTheDocument();
    });

    it("applies every draft fix for the picked date", () => {
      const onApplyAllSuggestions = vi.fn();
      withSuggestions({ onApplyAllSuggestions });

      expect(
        screen.queryByRole("button", { name: "Apply all draft fixes" }),
      ).not.toBeInTheDocument();
      fireEvent.click(dateHeading(/Wednesday, October 28/));
      fireEvent.click(day().getByRole("button", { name: "Apply all for this day" }));
      expect(onApplyAllSuggestions).toHaveBeenLastCalledWith("2026-10-28");
      expect(day().getByText(/Pickup approvals aren't included/)).toBeInTheDocument();
    });

    it("offers no Apply all when only approvals and advice remain", () => {
      renderPanel({
        onApplyAllSuggestions: vi.fn(),
        suggestions: {
          items: [view("d", "approvePickup"), view("e", "pattern")],
          notSuggestedByCell: new Map(),
        },
      });

      expect(
        screen.queryByRole("button", { name: "Apply all draft fixes" }),
      ).not.toBeInTheDocument();
      fireEvent.click(dateHeading(/Wednesday, October 28/));
      expect(
        day().queryByRole("button", { name: "Apply all for this day" }),
      ).not.toBeInTheDocument();
    });

    it("keeps applied changes in view with Undo, and an approval as published", () => {
      const onUndoSuggestion = vi.fn();
      withSuggestions({
        onUndoSuggestion,
        appliedSuggestions: [
          {
            id: "x",
            text: appliedSuggestionText("Restore Ben Shepherd's Day Shift on Wed, Oct 28"),
            final: false,
          },
          {
            id: "y",
            text: appliedSuggestionText("Approve Ana Crawford's pickup request"),
            final: true,
          },
          {
            id: "z",
            text: appliedSuggestionText("Change Cat Morrison back to Day Shift on Wed, Oct 28"),
            final: false,
          },
        ],
      });
      const applied = within(screen.getByRole("region", { name: "Applied" }));

      fireEvent.click(
        applied.getByRole("button", {
          name: "Undo: Restored Ben Shepherd's Day Shift on Wed, Oct 28",
        }),
      );
      expect(onUndoSuggestion).toHaveBeenCalledWith("x");
      expect(applied.getByText("Approved Ana Crawford's pickup request")).toBeInTheDocument();
      expect(applied.getByText("Published")).toBeInTheDocument();
      expect(
        applied.getByText("Changed Cat Morrison back to Day Shift on Wed, Oct 28"),
      ).toBeInTheDocument();
    });

    it("says so when short dates have no fixes", () => {
      renderPanel({ suggestions: { items: [], notSuggestedByCell: new Map() } });

      expect(
        screen.getByText("No fixes found. Select a short cell to see why."),
      ).toBeInTheDocument();
      fireEvent.click(dateHeading(/Wednesday, October 28/));
      expect(
        day().getByText(
          "No fixes found for this day. Select a short cell to see why each qualified person isn't suggested.",
        ),
      ).toBeInTheDocument();
    });

    it("gives someone who cannot edit shifts no suggestions and plain date headings", () => {
      withSuggestions({ canEditShifts: false });

      expect(screen.queryByText(/Select a date/)).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("button").filter((button) => button.classList.contains("dg-cc-day")),
      ).toHaveLength(0);
    });

    it("shows Ways to fix and Not suggested for a short cell, and neither for a staffed one", () => {
      withSuggestions();

      fireEvent.click(cell(/Wednesday, October 28/));
      const detail = within(screen.getByRole("region", { name: "Selected day" }));
      expect(detail.getByText("Ways to fix")).toBeInTheDocument();
      expect(detail.getByText("Detail a")).toBeInTheDocument();
      expect(detail.getByText("Outcome a")).toBeInTheDocument();
      expect(detail.getByText("Not suggested")).toBeInTheDocument();
      expect(
        detail
          .getAllByRole("listitem")
          .map((item) => item.textContent)
          .slice(-2),
      ).toEqual([
        "Ben Shepherd: Sick that day",
        "Cat Morrison: works Evening Shift that day, which overlaps",
      ]);

      fireEvent.click(cell(/Tuesday, October 27/));
      const staffed = within(screen.getByRole("region", { name: "Selected day" }));
      expect(staffed.queryByText("Ways to fix")).not.toBeInTheDocument();
      expect(staffed.queryByText("Not suggested")).not.toBeInTheDocument();
    });
  });

  describe("build", () => {
    const preview = (overrides: Partial<CoverageBuildPreview> = {}): CoverageBuildPreview => ({
      fixes: [],
      recurring: { shifts: 0, absences: 0 },
      counts: { assign: 0, restore: 0, moveBack: 0 },
      people: 0,
      shortBefore: 2,
      shortAfter: 2,
      overBefore: 0,
      overAfter: 0,
      staffShortBefore: 4,
      staffShortAfter: 4,
      skipped: [],
      overThreshold: [],
      choices: [],
      recurringPeople: [],
      shortCells: [],
      recurringSkipped: [],
      daysOff: [],
      blankDays: [],
      sixthDays: [],
      sixthWeeks: [],
      excluded: [],
      ...overrides,
    });
    const skippedWords = {
      personName: (id: string) => ({ ana: "Ana Crawford", ben: "Ben Shepherd" })[id] ?? id,
      formatDate: (dateKey: string) =>
        ({
          "2026-10-25": "Sun, Oct 25",
          "2026-10-26": "Mon, Oct 26",
          "2026-10-27": "Tue, Oct 27",
          "2026-11-01": "Sun, Nov 1",
        })[dateKey] ?? dateKey,
      reason: (entry: CoverageRuledOut) =>
        entry.reason.kind === "absence" ? "Sick that day" : "has a request waiting that day",
      rowLabel: (rowKey: string) => (rowKey === "1:5:1" ? "North Wing · Day MA" : rowKey),
    };
    const skip = (employeeId: string, dateKey: string, kind: "absence" | "request") =>
      ({
        rowKey: "1:5:1",
        dateKey,
        employeeId,
        requestId: null,
        reason: kind === "absence" ? { kind, absenceTypeId: 7 } : { kind, dateKey },
      }) as CoverageRuledOut;
    const withBuild = (
      state: ScheduleBuildState,
      overrides = {},
      words: Partial<typeof skippedWords> & { dayOffName?: string | null } = {},
      allowSixthDay = false,
    ) => {
      const build = {
        state,
        onPreview: vi.fn(),
        onBuild: vi.fn(),
        onCancel: vi.fn(),
        onDone: vi.fn(),
        skippedWords: { ...skippedWords, ...words },
        allowSixthDay,
        onAllowSixthDayChange: vi.fn(),
      };
      renderPanel({
        suggestions: { items: [], notSuggestedByCell: new Map() },
        build,
        ...overrides,
      });
      return build;
    };
    const section = () => within(screen.getByRole("region", { name: "Auto-build" }));

    it("says what a build does and previews the rows shown", () => {
      const build = withBuild({ status: "idle" });

      expect(
        section().getByText("All focus areas, Mon, Oct 26 to Wed, Oct 28"),
      ).toBeInTheDocument();
      expect(
        within(section().getByRole("list", { name: "How Auto-build works" }))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        "Fills open shifts with qualified staff who are free.",
        "Starts from recurring schedules and works around absences and waiting requests.",
        "Nothing changes until you apply it.",
      ]);
      fireEvent.click(section().getByRole("button", { name: "Generate schedule" }));
      expect(build.onPreview).toHaveBeenCalledWith(["1:5:1"]);
    });

    it("offers to fill what's still empty once the dates are built", () => {
      const build = withBuild({ status: "idle", built: true });
      expect(
        section().queryByRole("list", { name: "How Auto-build works" }),
      ).not.toBeInTheDocument();
      expect(
        section().queryByRole("button", { name: "Generate schedule" }),
      ).not.toBeInTheDocument();
      const again = section().getByRole("button", { name: "Fill what's still empty" });
      expect(again).toHaveClass("dg-btn-secondary");
      fireEvent.click(again);
      expect(build.onPreview).toHaveBeenCalledWith(["1:5:1"]);
    });

    it("leaves out the people picked before generating, and names them in the result", () => {
      const onExcludedChange = vi.fn();
      const excludeOptions = vi.fn(() => [
        { id: "ana", name: "Ana Crawford" },
        { id: "ben", name: "Ben Shepherd" },
      ]);
      renderPanel({
        suggestions: { items: [], notSuggestedByCell: new Map() },
        build: {
          state: { status: "idle" },
          onPreview: vi.fn(),
          onBuild: vi.fn(),
          onCancel: vi.fn(),
          skippedWords,
          // "zed" was left out while other focus areas were shown.
          excluded: ["ben", "zed"],
          excludeOptions,
          onExcludedChange,
        },
      });

      expect(excludeOptions).toHaveBeenCalledWith(["1:5:1"]);
      const picker = section().getByRole("button", { name: "Exclude staff" });
      expect(picker).toHaveTextContent("Ben Shepherd");
      expect(
        section().getByText("Auto-build fills only their recurring schedules."),
      ).toBeInTheDocument();
      fireEvent.click(picker);
      fireEvent.click(screen.getByRole("option", { name: /Ana Crawford/ }));
      expect(onExcludedChange).toHaveBeenCalledWith(["ben", "ana"]);

      cleanup();
      withBuild({
        status: "ready",
        preview: preview({
          fixes: [{ id: "x" }] as CoverageSuggestion[],
          people: 1,
          excluded: ["ben", "ana"],
        }),
      });
      expect(section().getByText("Excluded: Ana Crawford, Ben Shepherd")).toBeInTheDocument();
    });

    it("shows the preview's counts, then builds or cancels", () => {
      const fixes = [{ id: "x" }, { id: "y" }, { id: "z" }] as CoverageSuggestion[];
      const build = withBuild({
        status: "ready",
        preview: preview({
          fixes,
          counts: { assign: 2, restore: 1, moveBack: 0 },
          people: 3,
          shortAfter: 0,
          staffShortAfter: 1,
        }),
      });

      expect(section().getByText("3 changes for 3 people")).toBeInTheDocument();
      expect(section().getByText("2 new shifts · 1 restored")).toBeInTheDocument();
      expect(section().getByLabelText("2 now, 0 after")).toHaveTextContent("2 → 0");
      expect(section().getByLabelText("4 now, 1 after")).toHaveTextContent("4 → 1");
      fireEvent.click(section().getByRole("button", { name: "Apply" }));
      expect(build.onBuild).toHaveBeenCalled();
      fireEvent.click(section().getByRole("button", { name: "Discard" }));
      expect(build.onCancel).toHaveBeenCalled();
    });

    it.each([
      [{ shifts: 12, absences: 0 }, "12 changes for 2 people", null],
      [{ shifts: 0, absences: 1 }, "1 change for 2 people", null],
      [
        { shifts: 3, absences: 2 },
        "5 changes for 2 people",
        "3 recurring shifts · 2 recurring absences",
      ],
    ])("counts the recurring fills %o", (recurring, headline, breakdown) => {
      withBuild({ status: "ready", preview: preview({ recurring, people: 2 }) });
      expect(section().getByText(headline)).toBeInTheDocument();
      if (breakdown) expect(section().getByText(breakdown)).toBeInTheDocument();
      else expect(section().queryByText(/·/)).not.toBeInTheDocument();
      expect(section().getByRole("button", { name: "Apply" })).toBeInTheDocument();
    });

    it("names each person skipped once, with every date and reason in order", () => {
      withBuild({
        status: "ready",
        preview: preview({
          fixes: [{ id: "x" }] as CoverageSuggestion[],
          people: 1,
          skipped: [
            skip("ben", "2026-10-27", "request"),
            skip("ben", "2026-10-26", "absence"),
            skip("ana", "2026-10-26", "absence"),
            skip("ana", "2026-10-26", "absence"),
          ],
        }),
      });
      expect(section().queryByRole("list", { name: "Not scheduled" })).not.toBeInTheDocument();
      fireEvent.click(section().getByRole("button", { name: "2 people couldn't be scheduled" }));
      const list = within(section().getByRole("list", { name: "Not scheduled" }));
      expect(list.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Ana Crawford Mon, Oct 26: Sick that day",
        "Ben Shepherd Mon, Oct 26: Sick that day; Tue, Oct 27: has a request waiting that day",
      ]);
    });

    it("names each person it takes over the threshold, once per week", () => {
      withBuild({
        status: "ready",
        preview: preview({
          fixes: [{ id: "x" }, { id: "y" }, { id: "z" }] as CoverageSuggestion[],
          people: 2,
          overThreshold: [
            { employeeId: "ben", dateKey: "2026-10-27", suggestionId: "x", hours: 44 },
            { employeeId: "ben", dateKey: "2026-10-26", suggestionId: "y", hours: 44 },
            { employeeId: "ben", dateKey: "2026-11-02", suggestionId: "z", hours: 42.5 },
            { employeeId: "ana", dateKey: "2026-10-31", suggestionId: "w", hours: 48 },
          ],
        }),
      });
      const list = within(section().getByRole("list", { name: "Over 40 hours a week" }));
      expect(list.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Ana Crawford 48 hours, week of Sun, Oct 25",
        "Ben Shepherd 44 hours, week of Sun, Oct 25",
        "Ben Shepherd 42.5 hours, week of Sun, Nov 1",
      ]);
    });

    it("shows no overtime list when nobody goes over", () => {
      withBuild({
        status: "ready",
        preview: preview({ fixes: [{ id: "x" }] as CoverageSuggestion[], people: 1 }),
      });
      expect(section().queryByText("Over 40 hours a week")).not.toBeInTheDocument();
    });

    it("shows five people, then all of them", () => {
      const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
      withBuild({
        status: "ready",
        preview: preview({ skipped: ids.map((id) => skip(id, "2026-10-26", "absence")) }),
      });
      fireEvent.click(section().getByRole("button", { name: "7 people couldn't be scheduled" }));
      const list = () => within(section().getByRole("list", { name: "Not scheduled" }));
      expect(list().getAllByRole("listitem")).toHaveLength(5);
      fireEvent.click(section().getByRole("button", { name: "Show all 7" }));
      expect(list().getAllByRole("listitem")).toHaveLength(7);
    });

    describe("progress", () => {
      const bar = () => section().getByRole("progressbar");
      const status = () =>
        section()
          .getAllByRole("status")
          .find((element) => element.classList.contains("dg-cc-build-progress"));

      it("shows loading, then shifts placed with the share of spots filled", () => {
        withBuild({ status: "previewing", progress: null });
        expect(status()).toHaveTextContent("Loading recurring schedules and recent weeks0%");
        expect(bar()).toHaveAttribute("aria-valuenow", "0");
        expect(section().getByRole("button", { name: /Generate schedule/ })).toBeDisabled();
      });

      it("counts the spots filled while placing", () => {
        withBuild({ status: "previewing", progress: { placed: 3, filled: 3, needed: 12 } });
        expect(status()).toHaveTextContent("3 shifts placed25%");
        expect(bar()).toHaveAttribute("aria-valuenow", "25");
      });

      it("checks the plan again, then counts the saves, while applying", () => {
        const applying = preview({ fixes: [{ id: "x" }] as CoverageSuggestion[], people: 1 });
        withBuild({
          status: "applying",
          preview: applying,
          checking: { placed: 1, filled: 2, needed: 4 },
          saved: null,
          total: 0,
        });
        expect(status()).toHaveTextContent("Checking for changes made since generating50%");
        expect(section().queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
        cleanup();

        withBuild({ status: "applying", preview: applying, checking: null, saved: 12, total: 48 });
        expect(status()).toHaveTextContent("Saving changes: 12 of 4825%");
        expect(bar()).toHaveAttribute("aria-valuenow", "25");
        expect(section().getByText("1 change for 1 person")).toBeInTheDocument();
      });

      it("reads a build with nothing to fill as complete", () => {
        expect(planningPercent({ placed: 0, filled: 0, needed: 0 })).toBe(100);
        expect(planningPercent(null)).toBe(0);
      });
    });

    describe("after a build", () => {
      const built = (overrides: Partial<CoverageBuildPreview> = {}) =>
        withBuild({
          status: "built",
          preview: preview({
            fixes: [
              { id: "o", kind: "assign", employeeId: "ana" },
              { id: "a", kind: "assign", employeeId: "ana" },
              { id: "r", kind: "restore", employeeId: "ben" },
            ] as CoverageSuggestion[],
            recurring: { shifts: 2, absences: 0 },
            recurringPeople: [{ employeeId: "ben", shifts: 2, absences: 0 }],
            choices: [
              {
                suggestionId: "o",
                employeeId: "ana",
                dateKey: "2026-10-26",
                reason: "only",
                count: 0,
                others: 0,
              },
              {
                suggestionId: "a",
                employeeId: "ana",
                dateKey: "2026-10-27",
                reason: "hours",
                count: 8,
                others: 2,
              },
            ],
            people: 2,
            ...overrides,
          }),
        });

      it("says what each person was given and why", () => {
        built();
        expect(section().getByText("Applied 5 changes for 2 people")).toBeInTheDocument();
        const list = within(section().getByRole("list", { name: "What each person was given" }));
        expect(list.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
          "Ana Crawford 2 shifts · Fewest hours, Only one free",
          "Ben Shepherd 3 shifts · Recurring schedule, Restored",
        ]);
        expect(section().queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
      });

      it("names recurring shifts left out for the days-in-a-row limit", () => {
        built({
          recurringSkipped: [
            { employeeId: "ben", dateKey: "2026-10-27", days: 6 },
            { employeeId: "ben", dateKey: "2026-10-26", days: 6 },
          ],
        });
        const name = "Recurring shifts left out: too many days in a row or in a week";
        expect(
          within(section().getByRole("list", { name }))
            .getAllByRole("listitem")
            .map((item) => item.textContent),
        ).toEqual(["Ben Shepherd Mon, Oct 26, Tue, Oct 27"]);
      });

      it("says when a shift kept someone's days off together", () => {
        built({
          choices: [
            {
              suggestionId: "a",
              employeeId: "ana",
              dateKey: "2026-10-27",
              reason: "daysOff",
              count: 0,
              others: 2,
            },
          ],
        });
        expect(
          within(section().getByRole("list", { name: "What each person was given" })).getByText(
            /Keeps days off together/,
          ),
        ).toBeInTheDocument();
      });

      it("counts days off in the headline and for each person", () => {
        built({
          daysOff: [
            { employeeId: "ana", dateKey: "2026-10-26" },
            { employeeId: "ana", dateKey: "2026-10-28" },
            { employeeId: "cat", dateKey: "2026-10-26" },
          ],
          people: 3,
        });
        expect(section().getByText("Applied 8 changes for 3 people")).toBeInTheDocument();
        const rows = within(
          section().getByRole("list", { name: "What each person was given" }),
        ).getAllByRole("listitem");
        expect(rows.map((row) => row.textContent)).toContain(
          "Ana Crawford 2 shifts · 2 days off · Fewest hours, Only one free",
        );
        expect(rows.map((row) => row.textContent)).toContain("cat 1 day off");
      });

      it("names the days left blank for someone short of 5 days a week", () => {
        built({
          daysOff: [{ employeeId: "cat", dateKey: "2026-10-26" }],
          blankDays: [{ employeeId: "cat", dateKey: "2026-10-27" }],
          people: 2,
        });
        const rows = within(
          section().getByRole("list", { name: "What each person was given" }),
        ).getAllByRole("listitem");
        expect(rows.map((row) => row.textContent)).toContain("cat 1 day off · 1 day left blank");
      });

      it("links each shift still short to its cell", () => {
        built({ shortCells: [{ rowKey: "1:5:1", dateKey: "2026-10-27", staffShort: 1 }] });
        expect(section().getByText("Still short: 1 shift")).toBeInTheDocument();
        fireEvent.click(
          section().getByRole("button", { name: "North Wing · Day MA, Tue, Oct 27: 1 short" }),
        );
        expect(
          within(screen.getByRole("region", { name: "Selected day" })).getByText("Tue, Oct 27"),
        ).toBeInTheDocument();
      });

      it("shows five shifts still short, then all of them", () => {
        const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "a", "b", "c"];
        built({
          shortCells: dates.map((dateKey) => ({ rowKey: "1:5:1", dateKey, staffShort: 1 })),
        });
        const list = () => within(section().getByRole("list", { name: "Still short" }));
        expect(list().getAllByRole("listitem")).toHaveLength(5);
        fireEvent.click(section().getByRole("button", { name: "Show all 6" }));
        expect(list().getAllByRole("listitem")).toHaveLength(6);
      });

      it("leaves out empty lists and ends Auto-build with Done", () => {
        const build = built();
        expect(section().queryByText(/Still short/)).not.toBeInTheDocument();
        expect(section().queryByText("Over 40 hours a week")).not.toBeInTheDocument();
        fireEvent.click(section().getByRole("button", { name: "Done" }));
        expect(build.onDone).toHaveBeenCalled();
        expect(build.onCancel).not.toHaveBeenCalled();
      });
    });

    it("says when no day off absence is set, and lists days off in the breakdown", () => {
      withBuild(
        {
          status: "ready",
          preview: preview({
            fixes: [{ id: "x" }] as CoverageSuggestion[],
            counts: { assign: 1, restore: 0, moveBack: 0 },
            daysOff: [{ employeeId: "ana", dateKey: "2026-10-26" }],
            people: 1,
          }),
        },
        {},
        { dayOffName: null },
      );
      expect(section().getByText("1 new shift · 1 day off")).toBeInTheDocument();
      expect(section().getByText(/No day off absence is set/)).toBeInTheDocument();
    });

    it("offers 6 days in a week before generating, with a warning once on", () => {
      const build = withBuild({ status: "idle" });
      const option = section().getByRole("switch", { name: "Allow 6 days in a week" });
      expect(option).not.toBeChecked();
      expect(section().queryByRole("note")).not.toBeInTheDocument();
      fireEvent.click(option);
      expect(build.onAllowSixthDayChange).toHaveBeenCalledWith(true);
      cleanup();

      withBuild({ status: "idle" }, {}, {}, true);
      expect(section().getByRole("note")).toHaveTextContent(
        "Some people may work 6 days in a week or 6 in a row, never 7.",
      );
    });

    it("names everyone a build gives a sixth day, by week and by run", () => {
      withBuild({
        status: "ready",
        preview: preview({
          fixes: [{ id: "x" }] as CoverageSuggestion[],
          people: 1,
          sixthDays: [
            { employeeId: "ana", dateKey: "2026-10-27" },
            { employeeId: "ana", dateKey: "2026-10-26" },
            { employeeId: "ben", dateKey: "2026-10-28" },
          ],
          sixthWeeks: [{ employeeId: "ana", weekStart: "2026-10-25" }],
        }),
      });
      expect(
        within(section().getByRole("list", { name: "6 days in a row" }))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Ana Crawford Mon, Oct 26 to Tue, Oct 27", "Ben Shepherd 2026-10-28"]);
      expect(
        within(section().getByRole("list", { name: "6 days in a week" }))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Ana Crawford week of Sun, Oct 25"]);
    });

    it("lists nobody when nobody was skipped", () => {
      withBuild({
        status: "ready",
        preview: preview({ fixes: [{ id: "x" }] as CoverageSuggestion[], people: 1 }),
      });
      expect(
        section().queryByRole("button", { name: /couldn't be scheduled/ }),
      ).not.toBeInTheDocument();
    });

    it("says when there is nothing to build", () => {
      withBuild({ status: "ready", preview: preview() });
      expect(section().getByText(/Nothing to fill\. Nobody qualified is free/)).toBeInTheDocument();
    });

    it("says when the schedule could not be generated", () => {
      withBuild({ status: "failed" });
      expect(section().getByRole("alert")).toHaveTextContent("The schedule couldn't be generated.");
    });

    it("holds Build while another change is being applied", () => {
      withBuild(
        {
          status: "ready",
          preview: preview({ fixes: [{ id: "x" }] as CoverageSuggestion[], people: 1 }),
        },
        { busySuggestionId: "a" },
      );
      expect(section().getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    it("offers no build to someone who cannot edit shifts, or in Month view", () => {
      withBuild({ status: "idle" }, { canEditShifts: false });
      expect(screen.queryByRole("region", { name: "Auto-build" })).not.toBeInTheDocument();
    });

    it("offers no build in Month view", () => {
      withBuild({ status: "idle" }, { matrix: null });
      expect(screen.queryByRole("region", { name: "Auto-build" })).not.toBeInTheDocument();
    });

    it("clears the preview when the focus area filter changes", () => {
      const build = withBuild({ status: "idle" });
      fireEvent.click(screen.getByText("All focus areas"));
      fireEvent.click(screen.getByRole("option", { name: "North Wing" }));
      expect(build.onCancel).toHaveBeenCalled();
    });
  });
});
