import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UNATTRIBUTED_EDITOR_ID } from "@/lib/publish-attribution";
import {
  PublishChangeSummary,
  publishCoverageChangeText,
  publishSummaryPoints,
  type PublishActiveEditor,
  type PublishEditorRow,
} from "./PublishChangeSummary";

const row = (overrides: Partial<PublishEditorRow> = {}): PublishEditorRow => ({
  editorId: "user-1",
  isCurrentUser: false,
  name: null,
  isOnline: false,
  newShifts: 0,
  modifiedShifts: 0,
  deletedShifts: 0,
  newNotes: 0,
  deletedNotes: 0,
  totalChanges: 0,
  ...overrides,
});

const active = (overrides: Partial<PublishActiveEditor> = {}): PublishActiveEditor => ({
  userId: "user-2",
  name: "Casey Diaz",
  ...overrides,
});

function renderSummary(rows: PublishEditorRow[]) {
  return render(<PublishChangeSummary editorRows={rows} />);
}

function points(
  rows: PublishEditorRow[],
  coverageGapCount = 0,
  activeEditors: PublishActiveEditor[] = [],
) {
  return publishSummaryPoints({ editorRows: rows, activeEditors, coverageGapCount });
}

describe("PublishChangeSummary", () => {
  it("writes a lone point into the message, and leaves several to the box", () => {
    const rows = [row({ isCurrentUser: true, newShifts: 5, totalChanges: 5 })];
    const { rerender } = render(
      <PublishChangeSummary
        editorRows={rows}
        points={["2 coverage gaps remain in this period."]}
      />,
    );
    expect(screen.getByText("2 coverage gaps remain in this period.")).toBeInTheDocument();

    rerender(
      <PublishChangeSummary
        editorRows={rows}
        points={[
          "This publish opens 1 gap and closes none.",
          "2 coverage gaps remain in this period.",
        ]}
      />,
    );
    expect(screen.queryByText(/coverage gaps remain/)).not.toBeInTheDocument();
  });

  it("gives the current user their own card with itemised counts", () => {
    renderSummary([row({ isCurrentUser: true, newShifts: 2, modifiedShifts: 1, totalChanges: 3 })]);

    const card = screen.getByRole("region", { name: /Your drafts summary/i });
    expect(within(card).getByText("New shifts")).toBeInTheDocument();
    expect(within(card).getByText("Edited shifts")).toBeInTheDocument();
    expect(within(card).getByText("3")).toBeInTheDocument();
  });

  // The whole point: the publisher must see whose work is going live.
  it("gives each other editor their own named card", () => {
    const rows = [
      row({ editorId: "user-1", isCurrentUser: true, newShifts: 1, totalChanges: 1 }),
      row({ editorId: "user-2", name: "Casey Diaz", newShifts: 4, totalChanges: 4 }),
    ];
    renderSummary(rows);

    expect(points(rows)).toContain("Drafts from other editors are included, not just your own.");
    expect(screen.getByRole("region", { name: /Casey Diaz summary/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Your drafts summary/i })).toBeInTheDocument();
  });

  it("marks an editor with drafts who is on the schedule right now", () => {
    renderSummary([
      row({
        editorId: "user-2",
        name: "Casey Diaz",
        isOnline: true,
        newShifts: 4,
        totalChanges: 4,
      }),
    ]);

    expect(screen.getByText(/on the schedule now/i)).toBeInTheDocument();
  });

  it("does not mark the current user as a risk to themselves", () => {
    renderSummary([row({ isCurrentUser: true, isOnline: true, newShifts: 2, totalChanges: 2 })]);

    expect(screen.queryByText(/on the schedule now/i)).not.toBeInTheDocument();
  });

  describe("active editor warning", () => {
    // Publish no longer blocks on cell locks, so presence is the only thing
    // left that can tell the publisher someone is mid-change.
    it("warns about someone present even when they have no drafts yet", () => {
      expect(
        points([row({ isCurrentUser: true, newShifts: 2, totalChanges: 2 })], 0, [active()]),
      ).toEqual(["Anything the other editor on the schedule hasn't saved yet won't be published."]);
    });

    it("never names the people on the schedule", () => {
      const lines = points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0, [
        active({ name: "Nick Kosmas" }),
      ]);

      expect(lines.join(" ")).not.toMatch(/Nick Kosmas/);
      // The rows above already say whose drafts are included and how many, so
      // the warning does not restate it.
      expect(lines.join(" ")).not.toMatch(/their drafts will be published/i);
    });

    it("reads correctly with several people present", () => {
      expect(
        points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0, [
          active({ userId: "user-2", name: "Casey Diaz" }),
          active({ userId: "user-3", name: "Erin Fox" }),
        ]),
      ).toContain(
        "Anything the 2 other editors on the schedule haven't saved yet won't be published.",
      );
    });

    it("says nothing when nobody else is present", () => {
      expect(points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })])).toEqual([]);
    });
  });

  it("still itemises when the publisher is the only editor", () => {
    const rows = [row({ isCurrentUser: true, newShifts: 3, deletedNotes: 1, totalChanges: 4 })];
    renderSummary(rows);

    const card = screen.getByRole("region", { name: /Your drafts summary/i });
    expect(within(card).getByText("New shifts")).toBeInTheDocument();
    expect(within(card).getByText("Removed notes")).toBeInTheDocument();
    expect(points(rows)).not.toContain(
      "Drafts from other editors are included, not just your own.",
    );
  });

  it("falls back to a generic label when a name never resolved", () => {
    renderSummary([row({ editorId: "user-9", name: null, newShifts: 2, totalChanges: 2 })]);

    const card = screen.getByRole("region", { name: /Another editor summary/i });
    expect(within(card).getByText("New shifts")).toBeInTheDocument();
  });

  it("shows unattributed changes rather than hiding them", () => {
    renderSummary([row({ editorId: UNATTRIBUTED_EDITOR_ID, deletedShifts: 1, totalChanges: 1 })]);

    expect(
      screen.getByRole("region", { name: /Unattributed drafts summary/i }),
    ).toBeInTheDocument();
  });

  it("keeps the coverage gap warning", () => {
    expect(points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 3)).toEqual([
      "3 coverage gaps remain in this period.",
    ]);
    expect(points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 1)).toEqual([
      "1 coverage gap remains in this period.",
    ]);
  });

  it("omits the coverage line when there are no gaps", () => {
    expect(points([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0)).toEqual([]);
  });
});

describe("publishCoverageChangeText", () => {
  it.each([
    [{ opened: 2, closed: 0, partial: false }, "This publish opens 2 gaps and closes none."],
    [{ opened: 0, closed: 1, partial: false }, "This publish opens no gaps and closes 1."],
    [{ opened: 1, closed: 3, partial: false }, "This publish opens 1 gap and closes 3."],
    [{ opened: 0, closed: 0, partial: false }, "This publish doesn't open or close any gap."],
    [
      { opened: 1, closed: 0, partial: true },
      "This publish opens 1 gap and closes none on dates already published.",
    ],
  ])("words %o", (change, line) => {
    expect(publishCoverageChangeText(change)).toBe(line);
  });

  it("adds the line to the points, and nothing without coverage requirements", () => {
    const rows = [row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })];
    expect(
      publishSummaryPoints({
        editorRows: rows,
        coverageGapCount: 0,
        coverageChange: { opened: 1, closed: 2, partial: false },
      }),
    ).toEqual(["This publish opens 1 gap and closes 2."]);
    expect(
      publishSummaryPoints({ editorRows: rows, coverageGapCount: 0, coverageChange: null }),
    ).toEqual([]);
  });
});
