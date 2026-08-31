import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AbsenceTypesSettings from "@/components/settings/AbsenceTypes";
import type { AbsenceType } from "@/types";

const absenceType: AbsenceType = {
  id: 1,
  orgId: "org-1",
  label: "VAC",
  name: "Vacation Leave",
  color: "#E2E8F0",
  border: "#CBD5E1",
  text: "#475569",
  sortOrder: 0,
  archivedAt: null,
};

describe("AbsenceTypesSettings previews", () => {
  it("shows the short code in code mode", () => {
    render(
      <AbsenceTypesSettings
        absenceTypes={[absenceType]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="code"
      />,
    );

    const preview = document.querySelector('[data-absence-type-preview="code"]');
    expect(preview).toHaveTextContent("VAC");
    expect(preview).toHaveStyle({ background: "rgb(226, 232, 240)" });
    expect(screen.getByText("Vacation Leave")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vac vacation leave/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps the colored preview visible with the full name in name mode", () => {
    render(
      <AbsenceTypesSettings
        absenceTypes={[absenceType]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="name"
      />,
    );

    const preview = document.querySelector('[data-absence-type-preview="name"]');
    expect(preview).toHaveTextContent("Vacation Leave");
    expect(preview).toHaveStyle({ background: "rgb(226, 232, 240)" });
    expect(screen.getAllByText("Vacation Leave")).toHaveLength(1);
  });
});
