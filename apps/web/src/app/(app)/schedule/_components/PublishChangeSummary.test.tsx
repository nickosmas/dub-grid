import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UNATTRIBUTED_EDITOR_ID } from "@/lib/publish-attribution";
import {
  PublishChangeSummary,
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

function renderSummary(
  rows: PublishEditorRow[],
  coverageGapCount = 0,
  totalChanges = 5,
  activeEditors: PublishActiveEditor[] = [],
) {
  return render(
    <PublishChangeSummary
      editorRows={rows}
      activeEditors={activeEditors}
      windowLabel="Mar 1 - Mar 7, 2026"
      totalChanges={totalChanges}
      coverageGapCount={coverageGapCount}
    />,
  );
}

describe("PublishChangeSummary", () => {
  it("states the total and the window", () => {
    renderSummary([row({ isCurrentUser: true, newShifts: 5, totalChanges: 5 })]);

    expect(screen.getByText(/5 unpublished changes/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 1 - Mar 7, 2026/)).toBeInTheDocument();
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
    renderSummary([
      row({ editorId: "user-1", isCurrentUser: true, newShifts: 1, totalChanges: 1 }),
      row({ editorId: "user-2", name: "Casey Diaz", newShifts: 4, totalChanges: 4 }),
    ]);

    expect(screen.getByText(/not just your own/i)).toBeInTheDocument();
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
      renderSummary([row({ isCurrentUser: true, newShifts: 2, totalChanges: 2 })], 0, 2, [
        active(),
      ]);

      expect(screen.getByText(/Casey Diaz is on the schedule right now/i)).toBeInTheDocument();
      expect(screen.getByText(/not saved yet will not be/i)).toBeInTheDocument();
    });

    it("states presence once, without repeating the name", () => {
      renderSummary([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0, 1, [
        active({ name: "Nick Kosmas" }),
      ]);

      const warning = screen.getByText(/Nick Kosmas is on the schedule right now/i);
      expect(warning).toBeInTheDocument();
      expect(warning.textContent?.match(/Nick Kosmas/g)).toHaveLength(1);
      // The rows above already say whose drafts are included and how many, so
      // the warning does not restate it.
      expect(warning).not.toHaveTextContent(/their drafts will be published/i);
    });

    it("reads correctly with several people present", () => {
      renderSummary([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0, 1, [
        active({ userId: "user-2", name: "Casey Diaz" }),
        active({ userId: "user-3", name: "Erin Fox" }),
      ]);

      expect(
        screen.getByText(/Casey Diaz and Erin Fox are on the schedule right now/i),
      ).toBeInTheDocument();
    });

    it("says nothing when nobody else is present", () => {
      renderSummary([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0, 1, []);

      expect(screen.queryByText(/on the schedule right now/i)).not.toBeInTheDocument();
    });
  });

  it("still itemises when the publisher is the only editor", () => {
    renderSummary([row({ isCurrentUser: true, newShifts: 3, deletedNotes: 1, totalChanges: 4 })]);

    const card = screen.getByRole("region", { name: /Your drafts summary/i });
    expect(within(card).getByText("New shifts")).toBeInTheDocument();
    expect(within(card).getByText("Removed notes")).toBeInTheDocument();
    expect(screen.queryByText(/not just your own/i)).not.toBeInTheDocument();
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
    renderSummary([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 3);

    expect(screen.getByText(/3 coverage gaps remain/i)).toBeInTheDocument();
  });

  it("omits the coverage line when there are no gaps", () => {
    renderSummary([row({ isCurrentUser: true, newShifts: 1, totalChanges: 1 })], 0);

    expect(screen.queryByText(/coverage gap/i)).not.toBeInTheDocument();
  });
});
