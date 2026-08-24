import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DraftBanner from "@/components/DraftBanner";

const breakdown = {
  newShifts: 1,
  modifiedShifts: 2,
  deletedShifts: 1,
  newNotes: 0,
  deletedNotes: 0,
  totalChanges: 4,
};

describe("DraftBanner", () => {
  it("keys each count with the grid tone for its kind", () => {
    render(<DraftBanner onPublish={vi.fn()} onCancel={vi.fn()} breakdown={breakdown} />);

    const counts = screen.getByLabelText("Change counts and color key");
    expect(screen.getByText("1 new")).toBeInTheDocument();
    expect(screen.getByText("2 edited")).toBeInTheDocument();
    expect(screen.getByText("1 deleted")).toBeInTheDocument();
    expect(counts.querySelector('[data-change-legend-dot="modified"]')).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
  });

  it("keys only the kinds that are actually present", () => {
    render(
      <DraftBanner
        onPublish={vi.fn()}
        onCancel={vi.fn()}
        breakdown={{
          newShifts: 3,
          modifiedShifts: 0,
          deletedShifts: 0,
          newNotes: 0,
          deletedNotes: 0,
          totalChanges: 3,
        }}
      />,
    );

    const counts = screen.getByLabelText("Change counts and color key");
    expect(screen.getByText("3 new")).toBeInTheDocument();
    expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
    expect(screen.queryByText(/deleted/)).not.toBeInTheDocument();
    expect(counts.querySelector('[data-change-legend-dot="deleted"]')).toBeNull();
  });

  it("offers no highlight toggle — draft changes are always shown", () => {
    render(<DraftBanner onPublish={vi.fn()} onCancel={vi.fn()} breakdown={breakdown} />);

    expect(screen.queryByText(/Highlight/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hide Changes/)).not.toBeInTheDocument();
    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
  });
});
