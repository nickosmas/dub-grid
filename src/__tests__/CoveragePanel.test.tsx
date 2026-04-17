import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CoveragePanel from "@/components/CoveragePanel";
import type { FocusArea, ShiftCategory } from "@/types";

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    departmentId: null,
    name: "North Wing",
    sortOrder: 1,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Day",
    color: "#E5F3E8",
    sortOrder: 1,
  },
];

describe("CoveragePanel", () => {
  it("shows a neutral unpublished message before the first publish", () => {
    render(
      <CoveragePanel
        gaps={[]}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        activeFocusArea={null}
        publishedWindowState="unpublished"
        onClose={() => {}}
      />,
    );

    expect(screen.getAllByText("Not published yet").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Coverage details will appear after this period is published for the first time.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a partial-period note when only published dates are counted", () => {
    render(
      <CoveragePanel
        gaps={[]}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        activeFocusArea={null}
        publishedWindowState="partial"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Showing published dates only.")).toBeInTheDocument();
    expect(screen.getAllByText("No gaps on published dates").length).toBeGreaterThan(0);
  });
});
