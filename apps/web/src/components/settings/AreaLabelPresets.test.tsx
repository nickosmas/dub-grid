import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { storedOrganizationLabel } from "@dubgrid/domain";
import { AreaLabelPresets } from "@/components/settings/AreaLabelPresets";

describe("AreaLabelPresets", () => {
  it("offers care and other workplaces' words, marking the one in the field", () => {
    render(<AreaLabelPresets value=" wings " onSelect={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Suggested area labels" });
    expect(group).toHaveTextContent("AreasUnitsWingsHallsFloorsNeighborhoodsDesksLocations");
    expect(screen.getByRole("button", { name: "Wings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Units" })).toHaveAttribute("aria-pressed", "false");
  });

  it("fills the field with a preset, and Areas is the default that stores nothing", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AreaLabelPresets value="" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Units" }));
    await user.click(screen.getByRole("button", { name: "Areas" }));

    expect(onSelect.mock.calls.map(([label]) => label)).toEqual(["Units", "Areas"]);
    expect(storedOrganizationLabel("focusArea", "Units")).toBe("Units");
    expect(storedOrganizationLabel("focusArea", "Areas")).toBeNull();
  });
});
