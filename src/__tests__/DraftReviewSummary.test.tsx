import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DraftReviewSummary from "@/components/DraftReviewSummary";

describe("DraftReviewSummary", () => {
  it("renders the total and each non-zero draft category", () => {
    render(
      <DraftReviewSummary
        title="Your edits"
        description="Latest unpublished changes."
        breakdown={{
          newShifts: 3,
          modifiedShifts: 4,
          deletedShifts: 0,
          newNotes: 2,
          deletedNotes: 1,
          totalChanges: 10,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your edits" }),
    ).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("New shifts")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Edited shifts")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("New notes")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Removed notes")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("Deleted shifts")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no unpublished changes", () => {
    render(
      <DraftReviewSummary
        title="Organization total"
        description="All unpublished items."
        emptyMessage="Nothing to discard."
        breakdown={{
          newShifts: 0,
          modifiedShifts: 0,
          deletedShifts: 0,
          newNotes: 0,
          deletedNotes: 0,
          totalChanges: 0,
        }}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Nothing to discard.")).toBeInTheDocument();
    expect(screen.queryByText("New shifts")).not.toBeInTheDocument();
  });
});
