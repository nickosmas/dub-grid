import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScheduleOperationModal from "@/components/ScheduleOperationModal";

describe("ScheduleOperationModal", () => {
  it("renders a blocking modal with percentage progress and detail text", () => {
    render(
      <ScheduleOperationModal
        title="Importing previous schedule..."
        detail="Saved 12 of 24 shifts. Refreshing the schedule next."
        progress={50}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Importing previous schedule... progress",
      }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(
      screen.getByText("Saved 12 of 24 shifts. Refreshing the schedule next."),
    ).toBeInTheDocument();
  });

  it("clamps progress values above 100", () => {
    render(<ScheduleOperationModal title="Auto filling shifts..." progress={140} />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});
