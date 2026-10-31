import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("../../../shared/lib/haptics", () => ({ hapticSelection: vi.fn() }));

let OpenShiftsCard: (typeof import("./OpenShiftsCard"))["OpenShiftsCard"];

beforeAll(async () => {
  OpenShiftsCard = (await import("./OpenShiftsCard")).OpenShiftsCard;
});

describe("OpenShiftsCard empty states", () => {
  it("says an unpublished period has nothing to show yet, not that nothing is open", () => {
    render(<OpenShiftsCard coverageWindow="unpublished" openShifts={[]} />);

    expect(screen.getByText("Not published yet")).toBeInTheDocument();
    expect(
      screen.getByText("Open shifts will appear after this period is published."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No open shifts right now")).not.toBeInTheDocument();
  });

  it("limits a partly published period's empty state to its published dates", () => {
    render(<OpenShiftsCard coverageWindow="partial" openShifts={[]} />);

    expect(screen.getByText("No open shifts on published dates")).toBeInTheDocument();
  });

  it("keeps the plain empty state for a published period", () => {
    render(<OpenShiftsCard openShifts={[]} />);

    expect(screen.getByText("No open shifts right now")).toBeInTheDocument();
  });
});

function openShift(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-04-19",
    focusAreaId: 2,
    focusAreaName: "Skilled Nursing",
    needed: 1,
    urgency: null,
    state: { kind: "worked", segments: [], absenceTypeId: null },
    presentation: { label: "Day Shift", segments: [] },
    canVolunteer: false,
    volunteerBlockReason: null,
    ...overrides,
  } as never;
}

describe("OpenShiftsCard claim", () => {
  it("offers Claim only on a row the viewer can take, and claims that shift", () => {
    const onClaim = vi.fn();
    const mine = openShift("gap-mine");
    render(
      <OpenShiftsCard
        claim={{
          shiftFor: (row) => ((row as { id: string }).id === "gap-1" ? mine : null),
          isClaiming: () => false,
          isBusy: false,
          onClaim,
        }}
        openShifts={[openShift("gap-1"), openShift("gap-2", { focusAreaName: "Memory Care" })]}
      />,
    );

    const buttons = screen.getAllByText("Claim");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onClaim).toHaveBeenCalledWith(mine);
  });

  it("shows no Claim without a claim prop", () => {
    render(<OpenShiftsCard openShifts={[openShift("gap-1")]} />);

    expect(screen.queryByText("Claim")).not.toBeInTheDocument();
  });
});
