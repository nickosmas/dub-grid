import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JobDefinition, ShiftCategory } from "@/types";
import { describePreferences, PreferencesModal, shiftLabel } from "./PreferencesModal";

const shift = (id: number, name: string, focusAreaId: number, startTime: string, endTime: string) =>
  ({ id, orgId: "org", name, focusAreaId, startTime, endTime, sortOrder: id }) as ShiftCategory;
const SHIFTS = [
  shift(79, "Day Shift", 49, "07:00", "15:30"),
  shift(80, "Evening Shift", 49, "15:30", "00:00"),
  shift(81, "Day Shift", 50, "07:00", "15:30"),
];
const JOBS = [
  { id: 43, name: "Supervisor" },
  { id: 44, name: "Nurse" },
] as JobDefinition[];
const AREAS: Record<number, string> = { 49: "Skilled Nursing", 50: "Sheltered Care" };
const areaName = (id: number) => AREAS[id];

function open(overrides: Partial<Parameters<typeof PreferencesModal>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <PreferencesModal
      personName="Queen Nwosu"
      shifts={SHIFTS}
      jobs={JOBS}
      focusAreaName={areaName}
      shiftPreference={undefined}
      jobPreference={undefined}
      onSave={onSave}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
  return onSave;
}

describe("describePreferences", () => {
  const shiftNames: Record<number, string> = { 2: "Evening Shift", 3: "Night Shift" };
  const jobNames: Record<number, string> = { 43: "Supervisor" };

  it("says each mode and its items, the job first", () => {
    expect(
      describePreferences(
        { mode: "prefers", shiftIds: [2, 3] },
        { mode: "only", jobIds: [43] },
        (id) => shiftNames[id],
        (id) => jobNames[id],
      ),
    ).toBe("Only Supervisor · Prefers Evening Shift, Night Shift");
    expect(
      describePreferences(
        { mode: "only", shiftIds: [2] },
        undefined,
        (id) => shiftNames[id],
        (id) => jobNames[id],
      ),
    ).toBe("Only Evening Shift");
  });

  it("is empty without a preference", () => {
    expect(
      describePreferences(
        undefined,
        undefined,
        (id) => shiftNames[id],
        (id) => jobNames[id],
      ),
    ).toBeNull();
  });
});

describe("shiftLabel", () => {
  it("names the focus area only when another shift shares the name", () => {
    expect(shiftLabel(SHIFTS[0], SHIFTS, areaName)).toBe("Day Shift (Skilled Nursing)");
    expect(shiftLabel(SHIFTS[1], SHIFTS, areaName)).toBe("Evening Shift");
  });
});

describe("PreferencesModal", () => {
  it("starts with Shifts and Jobs, each with its current setting", () => {
    open({ jobPreference: { mode: "only", jobIds: [43] } });
    const start = within(screen.getByRole("group", { name: "Preferences" }));
    expect(start.getByRole("button", { name: /^Shifts/ })).toHaveTextContent("Any shift");
    expect(start.getByRole("button", { name: /^Jobs/ })).toHaveTextContent("Only Supervisor");
  });

  it("chooses shifts by focus area, goes Back keeping the choice, and saves both", () => {
    const onSave = open();
    fireEvent.click(screen.getByRole("button", { name: /^Shifts/ }));
    expect(screen.getByRole("radio", { name: /Any shift/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Only some shifts/ }));
    expect(screen.getByText("Choose at least one shift.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    const nursing = within(screen.getByRole("group", { name: "Skilled Nursing" }));
    expect(nursing.getByRole("checkbox", { name: /Evening Shift/ })).toHaveTextContent("3:30 PM");
    fireEvent.click(nursing.getByRole("checkbox", { name: /Evening Shift/ }));
    expect(screen.getByText("They won't be given shifts in Sheltered Care.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /^Shifts/ })).toHaveTextContent("Only Evening Shift");
    fireEvent.click(screen.getByRole("button", { name: /^Jobs/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Only some jobs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Supervisor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /^Shifts/ }));
    expect(screen.getByRole("radio", { name: /Only some shifts/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Evening Shift/ })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      shift: { mode: "only", shiftIds: [80] },
      job: { mode: "only", jobIds: [43] },
    });
  });

  it("keeps Save off while a step still needs an item, and says so on the start", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Jobs/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Prefers some jobs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /^Jobs/ })).toHaveTextContent(
      "Choose at least one job",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("clears a preference with Any", () => {
    const onSave = open({
      shiftPreference: { mode: "prefers", shiftIds: [79] },
      jobPreference: { mode: "only", jobIds: [44] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Jobs/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Any job/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ job: null });
  });

  it("saves only what changed, leaving a preference for a shift since gone as stored", () => {
    // Shift 99 is no longer offered (archived, or a focus area they left).
    const onSave = open({ shiftPreference: { mode: "only", shiftIds: [79, 99] } });
    expect(screen.getByRole("button", { name: /^Shifts/ })).toHaveTextContent("Only Day Shift");
    fireEvent.click(screen.getByRole("button", { name: /^Jobs/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Only some jobs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Nurse/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ job: { mode: "only", jobIds: [44] } });
  });
});
