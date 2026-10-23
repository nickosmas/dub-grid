import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShiftCategory } from "@/types";
import { describeShiftPreference, ShiftPreferenceModal, shiftLabel } from "./ShiftPreferenceModal";

const shift = (id: number, name: string, focusAreaId: number, startTime: string, endTime: string) =>
  ({ id, orgId: "org", name, focusAreaId, startTime, endTime, sortOrder: id }) as ShiftCategory;
const SHIFTS = [
  shift(79, "Day Shift", 49, "07:00", "15:30"),
  shift(80, "Evening Shift", 49, "15:30", "00:00"),
  shift(81, "Day Shift", 50, "07:00", "15:30"),
];
const AREAS: Record<number, string> = { 49: "Skilled Nursing", 50: "Sheltered Care" };
const areaName = (id: number) => AREAS[id];

describe("describeShiftPreference", () => {
  const names: Record<number, string> = { 2: "Evening Shift", 3: "Night Shift" };

  it("says the mode and the shifts", () => {
    expect(describeShiftPreference({ mode: "only", shiftIds: [2, 3] }, (id) => names[id])).toBe(
      "Only Evening Shift, Night Shift",
    );
    expect(describeShiftPreference({ mode: "prefers", shiftIds: [2] }, (id) => names[id])).toBe(
      "Prefers Evening Shift",
    );
  });

  it("is empty without a preference", () => {
    expect(describeShiftPreference(undefined, (id) => names[id])).toBeNull();
  });
});

describe("shiftLabel", () => {
  it("names the focus area only when another shift shares the name", () => {
    expect(shiftLabel(SHIFTS[0], SHIFTS, areaName)).toBe("Day Shift (Skilled Nursing)");
    expect(shiftLabel(SHIFTS[1], SHIFTS, areaName)).toBe("Evening Shift");
  });
});

describe("ShiftPreferenceModal", () => {
  it("chooses a mode, groups the shifts by focus area, and saves the chosen ones", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ShiftPreferenceModal
        personName="Queen Nwosu"
        shifts={SHIFTS}
        focusAreaName={areaName}
        preference={undefined}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /Any shift/ })).toBeChecked();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Only some shifts/ }));
    expect(screen.getByText("Choose at least one shift.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    const nursing = within(screen.getByRole("group", { name: "Skilled Nursing" }));
    expect(nursing.getByRole("checkbox", { name: /Evening Shift/ })).toHaveTextContent("3:30 PM");
    fireEvent.click(nursing.getByRole("checkbox", { name: /Evening Shift/ }));
    expect(screen.getByRole("group", { name: "Sheltered Care" })).toBeInTheDocument();
    expect(screen.getByText("They won't be given shifts in Sheltered Care.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ mode: "only", shiftIds: [80] });
  });

  it("clears a preference with Any shift", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ShiftPreferenceModal
        personName="Queen Nwosu"
        shifts={SHIFTS}
        focusAreaName={areaName}
        preference={{ mode: "prefers", shiftIds: [79] }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /Day Shift/, checked: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Any shift/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
