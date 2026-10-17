import { render, screen } from "@testing-library/react";
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
