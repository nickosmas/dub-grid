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
  it("shows the change color key only while change highlighting is enabled", () => {
    const props = {
      onPublish: vi.fn(),
      onCancel: vi.fn(),
      breakdown,
      onToggleDiff: vi.fn(),
    };

    const { rerender } = render(<DraftBanner {...props} showDiff />);

    const legend = screen.getByLabelText("Change color key");
    expect(legend).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.queryByText("Changed / Time")).not.toBeInTheDocument();
    expect(legend.querySelector('[data-change-legend-dot="modified"]')).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });

    rerender(<DraftBanner {...props} showDiff={false} />);

    expect(screen.queryByLabelText("Change color key")).not.toBeInTheDocument();
  });
});
